import { 
  collection, 
  doc, 
  addDoc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  Timestamp,
  setDoc,
  getDocFromServer,
  getDocsFromServer,
  collectionGroup
} from 'firebase/firestore';
import { db } from './config';
import { getCurrentUserAsync } from './auth';
import { FirebaseProject, CreateProjectData, ProjectSummary, CreateDesignFileData, DesignFile, DesignFileSummary } from './types';
import { FLAGS } from '@/flags';
import { listDesignFiles as repoListDesignFiles } from '@/services/designs.repo';

// 컬렉션 참조
const PROJECTS_COLLECTION = 'projects';

// 팀 스코프 경로 헬퍼 함수
async function getActiveTeamId(): Promise<string | null> {
  if (!FLAGS.teamScope) return null;
  
  // 먼저 localStorage에서 확인
  const storedTeamId = localStorage.getItem('activeTeamId');
  if (storedTeamId) return storedTeamId;
  
  // 없으면 개인 팀 ID 사용
  const user = await getCurrentUserAsync();
  if (!user) return null;
  
  return `personal_${user.uid}`;
}

// 프로젝트 컬렉션 경로 결정
async function getProjectsPath(): Promise<string> {
  if (!FLAGS.teamScope) {
    return PROJECTS_COLLECTION;
  }
  
  const teamId = await getActiveTeamId();
  if (teamId) {
    return `teams/${teamId}/projects`;
  }
  
  // Fallback to legacy path
  return PROJECTS_COLLECTION;
}

// 새 프로젝트 생성
export const createProject = async (projectData: CreateProjectData): Promise<{ id: string | null; error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { id: null, error: '로그인이 필요합니다.' };
    }

    // 팀 ID 가져오기
    const teamId = await getActiveTeamId();
    
    const newProject: Omit<FirebaseProject, 'id'> = {
      userId: user.uid,
      teamId: teamId || `personal_${user.uid}`, // 팀 ID 추가
      title: projectData.title,
      createdAt: serverTimestamp() as Timestamp,
      updatedAt: serverTimestamp() as Timestamp,
      version: '1.0.0',
      stats: {
        designFileCount: 0,
        lastOpenedAt: serverTimestamp() as Timestamp,
        furnitureCount: 0,
      },
      // spaceConfig은 사용자가 전달한 값 사용
      spaceConfig: projectData.spaceConfig || {
        width: 3600,
        height: 2400,
        depth: 1500,
        installType: 'builtin',
        surroundType: 'surround',
        baseConfig: {
          type: 'floor',
          height: 65,
          placementType: 'ground',
        },
        hasFloorFinish: false,
        floorFinish: null,
        wallConfig: {
          left: true,
          right: true,
          top: true,
        },
        materialConfig: {
          interiorColor: '#FFFFFF',
          doorColor: '#E0E0E0',  // 기본값 변경
        },
        columns: [],
        frameSize: { upper: 50, base: 50, left: 50, right: 50 },
        gapConfig: { left: 2, right: 2 },
      },
      // 빈 furniture 객체 추가
      furniture: {
        placedModules: [],
      },
    };

    // 1. Legacy 경로에 먼저 저장 (기본)
    const docRef = await addDoc(collection(db, PROJECTS_COLLECTION), newProject);
    console.log('✅ 프로젝트 생성 - Legacy path:', `${PROJECTS_COLLECTION}/${docRef.id}`);
    
    // 2. Dual-write if enabled
    if (FLAGS.dualWrite && FLAGS.teamScope && teamId) {
      try {
        // Team-scoped path에도 저장
        const teamPath = `teams/${teamId}/projects`;
        await setDoc(
          doc(db, teamPath, docRef.id),
          newProject,
          { merge: true }
        );
        console.log('✅ Dual-write to team path:', `${teamPath}/${docRef.id}`);
      } catch (dualWriteError) {
        console.warn('⚠️ Team path dual-write failed (non-critical):', dualWriteError);
        // Don't fail the entire operation if dual-write fails
      }
    }
    
    return { id: docRef.id, error: null };
  } catch (error) {
    console.error('프로젝트 생성 에러:', error);
    return { id: null, error: '프로젝트 생성 중 오류가 발생했습니다.' };
  }
};

// 디자인파일 생성
export const createDesignFile = async (data: CreateDesignFileData): Promise<{ id: string | null; error: string | null }> => {
  try {
    console.log('💾 createDesignFile 함수 호출됨:', {
      name: data.name,
      projectId: data.projectId,
      hasSpaceConfig: !!data.spaceConfig,
      hasFurniture: !!data.furniture,
      furnitureCount: data.furniture?.placedModules?.length || 0
    });
    
    const user = await getCurrentUserAsync();
    if (!user) {
      console.error('🚫 사용자 인증 실패');
      return { id: null, error: '로그인이 필요합니다.' };
    }

    console.log('👤 현재 사용자:', user.uid);

    const teamId = await getActiveTeamId();
    const now = serverTimestamp() as Timestamp;

    // undefined 필드들을 제외한 데이터 생성
    const baseData: any = {
      name: data.name,
      projectId: data.projectId,
      spaceConfig: data.spaceConfig,
      furniture: data.furniture,
      userId: user.uid,
      teamId: teamId || '',
      createdAt: now,
      updatedAt: now,
    };

    // thumbnail이 있을 때만 추가
    if (data.thumbnail !== undefined && data.thumbnail !== null) {
      baseData.thumbnail = data.thumbnail;
    }

    // folderId가 있을 때만 추가
    const designFileData: any = data.folderId 
      ? { ...baseData, folderId: data.folderId }
      : baseData;
      
    console.log('📋 최종 Firestore 저장 데이터:', {
      ...designFileData,
      furnitureModulesCount: designFileData.furniture?.placedModules?.length || 0,
      spaceConfigKeys: designFileData.spaceConfig ? Object.keys(designFileData.spaceConfig) : []
    });

    let docRef;
    let designId;
    
    // Legacy path를 기본으로 사용 (개인 프로젝트)
    if (false) {  // nested path 비활성화
      try {
        // Nested project path를 primary로 사용
        const { projectDesignsCol } = await import('@/firebase/collections');
        const nestedRef = await addDoc(
          projectDesignsCol(teamId, data.projectId),
          designFileData
        );
        designId = nestedRef.id;
        console.log('✅ Nested project path 저장 성공:', `teams/${teamId}/projects/${data.projectId}/designs/${designId}`);
        
        // Dual-write to legacy path
        if (FLAGS.dualWrite) {
          await setDoc(
            doc(db, 'designFiles', designId),
            designFileData,
            { merge: true }
          );
          console.log('✅ Dual-write to legacy path:', `designFiles/${designId}`);
          
          // Also write to team-scoped path
          if (FLAGS.teamScope) {
            const teamPath = `teams/${teamId}/designs`;
            await setDoc(
              doc(db, teamPath, designId),
              designFileData,
              { merge: true }
            );
            console.log('✅ Dual-write to team path:', `${teamPath}/${designId}`);
          }
        }
      } catch (nestedError) {
        console.error('❌ Nested path 저장 실패, legacy로 fallback:', nestedError);
        // Fallback to legacy path
        docRef = await addDoc(collection(db, 'designFiles'), designFileData);
        designId = docRef.id;
        console.log('✅ Legacy path 저장 성공 (fallback):', `designFiles/${designId}`);
      }
    } else {
      // Legacy path를 primary로 사용
      docRef = await addDoc(collection(db, 'designFiles'), designFileData);
      designId = docRef.id;
      console.log('✅ Legacy path 저장 성공:', `designFiles/${designId}`);
      
      // Dual-write if enabled
      if (FLAGS.dualWrite && teamId) {
        try {
          // Team-scoped path
          if (FLAGS.teamScope) {
            const teamPath = `teams/${teamId}/designs`;
            await setDoc(
              doc(db, teamPath, designId),
              designFileData,
              { merge: true }
            );
            console.log('✅ Dual-write to team path:', `${teamPath}/${designId}`);
          }
          
          // Nested project path
          if (FLAGS.nestedDesigns && data.projectId) {
            const { projectDesignDoc } = await import('@/firebase/collections');
            await setDoc(
              projectDesignDoc(teamId, data.projectId, designId),
              designFileData,
              { merge: true }
            );
            console.log('✅ Dual-write to nested project path:', `teams/${teamId}/projects/${data.projectId}/designs/${designId}`);
          }
        } catch (dualWriteError) {
          console.warn('⚠️ Dual-write failed (non-critical):', dualWriteError);
        }
      }
    }
    
    // 프로젝트 통계 업데이트
    await updateProjectStats(data.projectId);
    
    return { id: designId, error: null };
  } catch (error) {
    console.error('❌ 디자인파일 생성 에러:', error);
    const errorMessage = error instanceof Error ? error.message : '디자인파일 생성 중 오류가 발생했습니다.';
    return { id: null, error: errorMessage };
  }
};

// 프로젝트의 디자인파일 목록 가져오기
export const getDesignFiles = async (projectId: string): Promise<{ designFiles: DesignFileSummary[]; error: string | null }> => {
  try {
    console.log('🔍 [getDesignFiles] 시작:', { projectId });
    
    const user = await getCurrentUserAsync();
    if (!user) {
      return { designFiles: [], error: '로그인이 필요합니다.' };
    }

    const teamId = await getActiveTeamId();
    console.log('🔍 [getDesignFiles] 팀 ID:', teamId);
    
    // Use designs.repo.ts which handles nested, team-scoped, and legacy fallback
    const result = await repoListDesignFiles(
      projectId,
      user.uid,
      teamId || undefined
    );
    
    console.log('🔍 [getDesignFiles] repo 결과:', {
      hasError: !!result.error,
      designCount: result.designs?.length || 0,
      designs: result.designs?.map(d => ({
        id: d.id,
        name: d.name,
        projectId: d.projectId
      }))
    });
    
    if (result.error) {
      console.error('디자인파일 목록 가져오기 에러:', result.error);
      return { designFiles: [], error: result.error };
    }
    
    // 수동으로 업데이트 시간순 정렬 (이미 정렬되어 있지만 확실하게)
    result.designs.sort((a, b) => {
      const aTime = a.updatedAt?.seconds || 0;
      const bTime = b.updatedAt?.seconds || 0;
      return bTime - aTime;
    });

    console.log('🔍 [getDesignFiles] 최종 결과:', {
      count: result.designs.length,
      firstDesign: result.designs[0]
    });

    return { designFiles: result.designs, error: null };
  } catch (error) {
    console.error('디자인파일 목록 가져오기 에러:', error);
    return { designFiles: [], error: '디자인파일 목록을 가져오는 중 오류가 발생했습니다.' };
  }
};

// 프로젝트 통계 업데이트
const updateProjectStats = async (projectId: string) => {
  try {
    const { designFiles } = await getDesignFiles(projectId);
    const projectRef = doc(db, PROJECTS_COLLECTION, projectId);
    
    await updateDoc(projectRef, {
      'stats.designFileCount': designFiles.length,
      'stats.lastOpenedAt': serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('프로젝트 통계 업데이트 에러:', error);
  }
};

// 프로젝트 불러오기
export const getProject = async (projectId: string): Promise<{ project: FirebaseProject | null; error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { project: null, error: '로그인이 필요합니다.' };
    }

    const docRef = doc(db, PROJECTS_COLLECTION, projectId);
    const docSnap = await getDocFromServer(docRef);

    if (!docSnap.exists()) {
      return { project: null, error: '프로젝트를 찾을 수 없습니다.' };
    }

    const data = docSnap.data();
    
    // 소유자 확인
    if (data.userId !== user.uid) {
      return { project: null, error: '프로젝트에 접근할 권한이 없습니다.' };
    }

    const project: FirebaseProject = {
      id: docSnap.id,
      ...data,
    } as FirebaseProject;

    // 마지막 열람 시간 업데이트 (임시로 비활성화 - Firebase 내부 에러 방지)
    // await updateLastOpenedAt(projectId);

    return { project, error: null };
  } catch (error) {
    console.error('프로젝트 불러오기 에러:', error);
    return { project: null, error: '프로젝트 불러오기 중 오류가 발생했습니다.' };
  }
};

// 별칭 함수 (backward compatibility)
// 프로젝트 상세 조회 (뷰어용 - 모든 데이터 포함)
export const getProjectById = async (projectId: string): Promise<{ project: any | null; error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { project: null, error: '로그인이 필요합니다.' };
    }

    const docRef = doc(db, PROJECTS_COLLECTION, projectId);
    const docSnap = await getDocFromServer(docRef);

    if (!docSnap.exists()) {
      return { project: null, error: '프로젝트를 찾을 수 없습니다.' };
    }

    const data = docSnap.data();
    
    // 소유자 확인
    if (data.userId !== user.uid) {
      return { project: null, error: '프로젝트에 접근할 권한이 없습니다.' };
    }

    // 전체 데이터 반환 (뷰어에서 필요한 모든 데이터 포함)
    const project = {
      id: docSnap.id,
      ...data,
      // 명시적으로 필요한 데이터 확인
      spaceConfig: data.spaceConfig || null,
      furniture: data.furniture || { placedModules: [] },
      stats: data.stats || { furnitureCount: 0 }
    };

    console.log('🔍 Firebase 프로젝트 조회:', {
      id: project.id,
      hasSpaceConfig: !!project.spaceConfig,
      furnitureCount: project.furniture?.placedModules?.length || 0
    });

    return { project, error: null };
  } catch (error) {
    console.error('프로젝트 불러오기 에러:', error);
    return { project: null, error: '프로젝트 불러오기 중 오류가 발생했습니다.' };
  }
};

// 프로젝트 업데이트
export const updateProject = async (
  projectId: string, 
  updates: Partial<CreateProjectData>, 
  thumbnail?: string
): Promise<{ error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { error: '로그인이 필요합니다.' };
    }

    const docRef = doc(db, PROJECTS_COLLECTION, projectId);
    
    // 먼저 소유자 확인 (서버에서 직접 가져오기)
    const docSnap = await getDocFromServer(docRef);
    if (!docSnap.exists() || docSnap.data().userId !== user.uid) {
      return { error: '프로젝트에 접근할 권한이 없습니다.' };
    }

    const updateData = {
      updatedAt: serverTimestamp(),
      ...(updates.title && { title: updates.title }),
      ...(updates.projectData && { projectData: updates.projectData }),
      ...(updates.spaceConfig && { spaceConfig: updates.spaceConfig }),
      ...(updates.furniture && { 
        furniture: updates.furniture,
        'stats.furnitureCount': updates.furniture.placedModules.length 
      }),
      ...(thumbnail && { thumbnail })
    };

    if (updates.spaceConfig) {
      console.log('🔥 Firebase 저장 - spaceConfig 입력:', updates.spaceConfig);
      console.log('🔥 Firebase 저장 - materialConfig 입력:', updates.spaceConfig.materialConfig);
    }

    console.log('🔥 Firebase 저장 - 최종 updateData:', updateData);
    await updateDoc(docRef, updateData);
    
    // 저장 후 실제 저장된 데이터 확인
    const verifyDocSnap = await getDoc(docRef);
    if (verifyDocSnap.exists()) {
      const savedData = verifyDocSnap.data();
      console.log('🔥 Firebase 저장 후 확인 - spaceConfig:', savedData.spaceConfig);
      console.log('🔥 Firebase 저장 후 확인 - materialConfig:', savedData.spaceConfig?.materialConfig);
    }
    
    return { error: null };
  } catch (error) {
    console.error('프로젝트 업데이트 에러:', error);
    return { error: '프로젝트 업데이트 중 오류가 발생했습니다.' };
  }
};

// 프로젝트 삭제 (모든 디자인파일도 함께 삭제)
export const deleteProject = async (projectId: string): Promise<{ error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { error: '로그인이 필요합니다.' };
    }

    // 삭제할 프로젝트 참조들을 저장할 배열
    const projectRefsToDelete = [];
    let projectData = null;
    
    // 1. 팀 스코프 경로 확인
    if (FLAGS.teamScope) {
      const teamId = await getActiveTeamId();
      if (teamId) {
        const teamProjectRef = doc(db, `teams/${teamId}/projects`, projectId);
        const teamDocSnap = await getDocFromServer(teamProjectRef);
        
        if (teamDocSnap.exists()) {
          projectRefsToDelete.push(teamProjectRef);
          projectData = teamDocSnap.data();
          console.log('팀 스코프에서 프로젝트 찾음:', `teams/${teamId}/projects/${projectId}`);
        }
      }
    }
    
    // 2. Legacy 경로 확인 (항상 확인하여 양쪽 경로에서 모두 삭제)
    const legacyRef = doc(db, PROJECTS_COLLECTION, projectId);
    const legacySnap = await getDocFromServer(legacyRef);
    
    if (legacySnap.exists()) {
      projectRefsToDelete.push(legacyRef);
      if (!projectData) {
        projectData = legacySnap.data();
      }
      console.log('Legacy 경로에서 프로젝트 찾음:', `projects/${projectId}`);
    }
    
    // 프로젝트를 찾지 못한 경우
    if (projectRefsToDelete.length === 0 || !projectData) {
      console.error('프로젝트를 찾을 수 없음:', projectId);
      return { error: '프로젝트를 찾을 수 없습니다.' };
    }
    
    // 소유자 확인
    if (projectData.userId !== user.uid) {
      console.error('프로젝트 삭제 권한 없음:', {
        projectUserId: projectData.userId,
        currentUserId: user.uid,
        projectId
      });
      return { error: '프로젝트 삭제 권한이 없습니다.' };
    }

    // 1. 프로젝트에 속한 모든 디자인파일 삭제
    const designFilesQuery = query(
      collection(db, 'designFiles'),
      where('projectId', '==', projectId)
    );
    const designFilesSnapshot = await getDocsFromServer(designFilesQuery);
    
    if (designFilesSnapshot.size > 0) {
      const deletePromises = designFilesSnapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
      console.log(`디자인파일 ${designFilesSnapshot.size}개 삭제 완료`);
    }

    // 2. 모든 경로에서 프로젝트 삭제
    const deleteProjectPromises = projectRefsToDelete.map(ref => deleteDoc(ref));
    await Promise.all(deleteProjectPromises);
    console.log(`프로젝트 삭제 완료 (${projectRefsToDelete.length}개 경로에서 삭제):`, projectId);
    
    console.log(`프로젝트 삭제 완료: ${projectId}`);
    return { error: null };
  } catch (error) {
    console.error('프로젝트 삭제 에러:', error);
    return { error: '프로젝트 삭제 중 오류가 발생했습니다.' };
  }
};

// 디자인파일 업데이트 (썸네일 포함)
export const updateDesignFile = async (
  designFileId: string, 
  updates: { 
    name?: string;
    spaceConfig?: any;
    furniture?: any;
    thumbnail?: string;
  }
): Promise<{ error: string | null }> => {
  try {
    console.log('🔥 [updateDesignFile] 시작:', {
      designFileId,
      hasName: !!updates.name,
      hasSpaceConfig: !!updates.spaceConfig,
      hasFurniture: !!updates.furniture,
      hasThumbnail: !!updates.thumbnail,
      furnitureCount: updates.furniture?.placedModules?.length || 0
    });

    const user = await getCurrentUserAsync();
    if (!user) {
      console.error('🔥 [updateDesignFile] 사용자 인증 실패');
      return { error: '로그인이 필요합니다.' };
    }

    // 디자인 파일을 찾기 위한 변수들
    let designDocRef = null;
    let docSnap = null;
    let designData = null;
    let foundPath = null;
    let projectId = null;
    
    // 1. 먼저 legacy path에서 디자인 파일 찾기
    const legacyRef = doc(db, 'designFiles', designFileId);
    const legacySnap = await getDocFromServer(legacyRef);
    
    if (legacySnap.exists()) {
      designDocRef = legacyRef;
      docSnap = legacySnap;
      designData = legacySnap.data();
      projectId = designData.projectId;
      foundPath = 'legacy';
      console.log('🔥 Legacy path에서 디자인 찾음:', { designFileId, projectId });
    }
    
    // 2. Legacy에서 못 찾았으면 team-scoped path 시도
    if (!designDocRef) {
      const teamId = await getActiveTeamId();
      if (FLAGS.teamScope && teamId) {
        const teamDesignRef = doc(db, `teams/${teamId}/designs`, designFileId);
        const teamSnap = await getDocFromServer(teamDesignRef);
        
        if (teamSnap.exists()) {
          designDocRef = teamDesignRef;
          docSnap = teamSnap;
          designData = teamSnap.data();
          projectId = designData.projectId;
          foundPath = 'team-scoped';
          console.log('🔥 Team-scoped path에서 디자인 찾음:', { designFileId, teamId, projectId });
        }
      }
    }
    
    // 3. 여전히 못 찾았으면 nested path 시도 (projectId를 알아야 함)
    // Legacy나 team-scoped에서 projectId를 얻었다면 nested path도 확인
    if (!designDocRef && FLAGS.nestedDesigns && projectId) {
      const teamId = await getActiveTeamId();
      if (teamId) {
        const nestedRef = doc(db, `teams/${teamId}/projects/${projectId}/designs`, designFileId);
        const nestedSnap = await getDocFromServer(nestedRef);
        
        if (nestedSnap.exists()) {
          designDocRef = nestedRef;
          docSnap = nestedSnap;
          designData = nestedSnap.data();
          foundPath = 'nested';
          console.log('🔥 Nested path에서 디자인 찾음:', { designFileId, teamId, projectId });
        }
      }
    }
    
    // 디자인 파일을 찾지 못한 경우
    if (!designDocRef || !designData) {
      console.error('🔥 [updateDesignFile] 디자인파일을 찾을 수 없음:', designFileId);
      return { error: '디자인파일을 찾을 수 없습니다.' };
    }

    const updateData = {
      updatedAt: serverTimestamp(),
      ...(updates.name && { name: updates.name }),
      ...(updates.spaceConfig && { spaceConfig: updates.spaceConfig }),
      ...(updates.furniture && { furniture: updates.furniture }),
      ...(updates.thumbnail && { thumbnail: updates.thumbnail })
    };

    console.log('🔥 [updateDesignFile] 업데이트 데이터:', {
      foundPath,
      hasUpdatedAt: !!updateData.updatedAt,
      keys: Object.keys(updateData),
      furnitureModulesCount: updateData.furniture?.placedModules?.length || 0
    });

    // 찾은 경로에 업데이트
    await updateDoc(designDocRef, updateData);
    
    // Dual-write if enabled
    if (FLAGS.dualWrite) {
      const teamId = await getActiveTeamId();
      
      // Legacy path가 아니면 legacy에도 저장
      if (foundPath !== 'legacy') {
        try {
          const legacyRef = doc(db, 'designFiles', designFileId);
          await updateDoc(legacyRef, updateData);
          console.log('🔥 Dual-write to legacy path 완료');
        } catch (e) {
          console.warn('Legacy path dual-write 실패 (문서가 없을 수 있음):', e);
        }
      }
      
      // Team-scoped path가 아니고 teamId가 있으면 team-scoped에도 저장
      if (foundPath !== 'team-scoped' && FLAGS.teamScope && teamId) {
        try {
          const teamRef = doc(db, `teams/${teamId}/designs`, designFileId);
          await updateDoc(teamRef, updateData);
          console.log('🔥 Dual-write to team-scoped path 완료');
        } catch (e) {
          console.warn('Team-scoped path dual-write 실패 (문서가 없을 수 있음):', e);
        }
      }
      
      // Nested path가 아니고 FLAGS.nestedDesigns가 켜져 있으면 nested에도 저장
      if (foundPath !== 'nested' && FLAGS.nestedDesigns && teamId && projectId) {
        try {
          const nestedRef = doc(db, `teams/${teamId}/projects/${projectId}/designs`, designFileId);
          await updateDoc(nestedRef, updateData);
          console.log('🔥 Dual-write to nested path 완료');
        } catch (e) {
          console.warn('Nested path dual-write 실패 (문서가 없을 수 있음):', e);
        }
      }
    }
    
    // 저장 후 즉시 확인 (서버에서 직접 가져오기)
    console.log('🔥 [updateDesignFile] 저장 직후 확인 시작');
    const verifyDoc = await getDocFromServer(designDocRef);
    if (verifyDoc.exists()) {
      const savedData = verifyDoc.data();
      console.log('🔥 [updateDesignFile] 저장 직후 확인:', {
        savedFurnitureCount: savedData.furniture?.placedModules?.length || 0,
        savedUpdatedAt: savedData.updatedAt,
        savedSpaceConfigKeys: savedData.spaceConfig ? Object.keys(savedData.spaceConfig) : []
      });
    }
    
    // 디자인파일이 업데이트되면 해당 프로젝트의 썸네일도 업데이트
    if (updates.thumbnail && projectId) {
      try {
        const projectRef = doc(db, PROJECTS_COLLECTION, projectId);
        await updateDoc(projectRef, {
          thumbnail: updates.thumbnail,
          updatedAt: serverTimestamp()
        });
        console.log(`프로젝트 썸네일도 업데이트됨: ${projectId}`);
      } catch (projectUpdateError) {
        console.warn('프로젝트 썸네일 업데이트 실패:', projectUpdateError);
      }
    }
    
    console.log(`디자인파일 업데이트 완료: ${designFileId}`);
    return { error: null };
  } catch (error) {
    console.error('디자인파일 업데이트 에러:', error);
    return { error: '디자인파일 업데이트 중 오류가 발생했습니다.' };
  }
};

// 디자인파일 삭제
export const deleteDesignFile = async (designFileId: string, projectId: string): Promise<{ error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { error: '로그인이 필요합니다.' };
    }

    const docRef = doc(db, 'designFiles', designFileId);
    
    // 먼저 소유권 확인 (디자인파일이 속한 프로젝트의 소유자인지 확인)
    const projectRef = doc(db, PROJECTS_COLLECTION, projectId);
    const projectSnap = await getDocFromServer(projectRef);
    
    if (!projectSnap.exists() || projectSnap.data().userId !== user.uid) {
      return { error: '이 디자인파일을 삭제할 권한이 없습니다.' };
    }

    // 디자인파일 삭제
    await deleteDoc(docRef);
    
    // 프로젝트 통계 업데이트
    await updateProjectStats(projectId);
    
    console.log(`디자인파일 삭제 완료: ${designFileId}`);
    return { error: null };
  } catch (error) {
    console.error('디자인파일 삭제 에러:', error);
    return { error: '디자인파일 삭제 중 오류가 발생했습니다.' };
  }
};

// 사용자의 프로젝트 목록 가져오기
export const getUserProjects = async (userId?: string): Promise<{ projects: ProjectSummary[]; error: string | null }> => {
  // Use the new repository pattern
  const { listProjects } = await import('@/services/projects.repo');
  
  // userId가 제공되면 사용하고, 그렇지 않으면 현재 사용자 확인
  let targetUserId = userId;
  if (!targetUserId) {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { projects: [], error: '로그인이 필요합니다.' };
    }
    targetUserId = user.uid;
  }
  
  return listProjects(targetUserId);
};

// 마지막 열람 시간 업데이트 (내부 함수) - Firebase 내부 에러로 인해 비활성화
// const updateLastOpenedAt = async (projectId: string) => {
//   try {
//     const docRef = doc(db, PROJECTS_COLLECTION, projectId);
//     await updateDoc(docRef, {
//       'stats.lastOpenedAt': serverTimestamp(),
//     });
//   } catch (error) {
//     console.error('마지막 열람 시간 업데이트 에러:', error);
//     // 이 에러는 무시 (중요하지 않음)
//   }
// };

// 디자인 파일 ID로 조회
export const getDesignFileById = async (designFileId: string): Promise<{ designFile: DesignFile | null; error: string | null }> => {
  try {
    console.log('🔥 [Firebase] getDesignFileById 호출:', designFileId);
    const user = await getCurrentUserAsync();
    if (!user) {
      console.log('🔥 [Firebase] 사용자 인증 실패');
      return { designFile: null, error: '로그인이 필요합니다.' };
    }

    const docRef = doc(db, 'designFiles', designFileId);
    console.log('🔥 [Firebase] Firestore 문서 조회 중... (서버에서 직접)');
    // 캐시를 무시하고 서버에서 직접 가져오기
    const docSnap = await getDocFromServer(docRef);
    console.log('🔥 [Firebase] 문서 존재 여부:', docSnap.exists());

    if (!docSnap.exists()) {
      console.log('🔥 [Firebase] 디자인 파일이 존재하지 않음');
      return { designFile: null, error: '디자인 파일을 찾을 수 없습니다.' };
    }

    const data = docSnap.data();
    console.log('🔥 [Firebase] 디자인 파일 원본 데이터:', data);
    console.log('🔥 [Firebase] 디자인 파일 가구 데이터:', { 
      hasData: !!data,
      projectId: data?.projectId,
      hasFurniture: !!data?.furniture,
      furnitureData: data?.furniture,
      placedModules: data?.furniture?.placedModules,
      furnitureCount: data?.furniture?.placedModules?.length || 0
    });
    
    // 가구 데이터가 있는지 한 번 더 체크하고 배열인지 확인
    if (data?.furniture?.placedModules && !Array.isArray(data.furniture.placedModules)) {
      console.error('🔥 [Firebase] placedModules가 배열이 아님:', data.furniture.placedModules);
      data.furniture.placedModules = [];
    }
    
    // 디자인 파일이 속한 프로젝트의 권한 확인
    // Multi-path 아키텍처에서는 프로젝트가 teams/{teamId}/projects/{projectId}에 있음
    const projectRef = doc(db, PROJECTS_COLLECTION, data.projectId);
    const projectSnap = await getDocFromServer(projectRef);
    
    if (!projectSnap.exists()) {
      console.log('🔥 [Firebase] 프로젝트가 존재하지 않음:', data.projectId);
      // 프로젝트가 root에 없으면 teams 컬렉션에서 찾기
      const teamsQuery = query(
        collectionGroup(db, 'projects'),
        where('__name__', '==', data.projectId)
      );
      const teamsSnapshot = await getDocs(teamsQuery);
      
      if (teamsSnapshot.empty) {
        return { designFile: null, error: '프로젝트를 찾을 수 없습니다.' };
      }
      
      // teams 컬렉션에서 프로젝트를 찾았으면 권한 확인
      const projectDoc = teamsSnapshot.docs[0];
      const projectData = projectDoc.data();
      const teamPath = projectDoc.ref.parent.parent?.id; // teams/{teamId}
      
      // 팀 멤버 확인
      if (teamPath) {
        const teamRef = doc(db, 'teams', teamPath);
        const teamSnap = await getDocFromServer(teamRef);
        if (teamSnap.exists()) {
          const teamData = teamSnap.data();
          const isTeamMember = teamData.members?.some((m: any) => 
            m.userId === user.uid || m.email === user.email
          );
          if (!isTeamMember) {
            return { designFile: null, error: '디자인 파일에 접근할 권한이 없습니다.' };
          }
        }
      }
    } else {
      // root 프로젝트인 경우 기존 방식대로 확인
      if (projectSnap.data().userId !== user.uid) {
        return { designFile: null, error: '디자인 파일에 접근할 권한이 없습니다.' };
      }
    }

    console.log('🪑 [Firebase] 가구 데이터 처리 전:', {
      rawFurniture: data.furniture,
      hasFurniture: !!data.furniture,
      hasPlacedModules: !!data.furniture?.placedModules,
      placedModulesCount: data.furniture?.placedModules?.length || 0
    });
    
    const designFile: DesignFile = {
      id: docSnap.id,
      name: data.name,
      projectId: data.projectId,
      folderId: data.folderId,
      spaceConfig: data.spaceConfig,
      furniture: data.furniture || { placedModules: [] },
      thumbnail: data.thumbnail,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };

    console.log('🔍 디자인 파일 조회 완료:', {
      id: designFile.id,
      name: designFile.name,
      furniture: designFile.furniture,
      placedModulesCount: designFile.furniture?.placedModules?.length || 0
    });

    return { designFile, error: null };
  } catch (error) {
    console.error('디자인 파일 조회 에러:', error);
    return { designFile: null, error: '디자인 파일을 불러오는 중 오류가 발생했습니다.' };
  }
};

// 공유 링크용 - 인증 없이 디자인 파일 조회
export const getDesignFileByIdPublic = async (designFileId: string): Promise<{ designFile: DesignFile | null; error: string | null }> => {
  try {
    console.log('🔥 [Firebase] getDesignFileByIdPublic 호출 (공유 링크):', designFileId);

    const docRef = doc(db, 'designFiles', designFileId);
    console.log('🔥 [Firebase] Firestore 문서 조회 중... (서버에서 직접)');
    console.log('🔥 [Firebase] 문서 참조 경로:', docRef.path);
    
    // 캐시를 무시하고 서버에서 직접 가져오기
    const docSnap = await getDocFromServer(docRef);
    console.log('🔥 [Firebase] 문서 스냅샷:', docSnap);
    console.log('🔥 [Firebase] 문서 존재 여부:', docSnap.exists());

    if (!docSnap.exists()) {
      console.log('🔥 [Firebase] 디자인 파일이 존재하지 않음');
      return { designFile: null, error: '디자인 파일을 찾을 수 없습니다.' };
    }

    const data = docSnap.data();
    console.log('🔥 [Firebase] 디자인 파일 원본 데이터 (공유):', data);
    console.log('🔥 [Firebase] 디자인 파일 가구 데이터 (공유):', { 
      hasData: !!data,
      projectId: data?.projectId,
      hasFurniture: !!data?.furniture,
      furnitureData: data?.furniture,
      placedModules: data?.furniture?.placedModules,
      furnitureCount: data?.furniture?.placedModules?.length || 0
    });
    
    const designFile: DesignFile = {
      id: docSnap.id,
      name: data.name,
      projectId: data.projectId,
      folderId: data.folderId,
      spaceConfig: data.spaceConfig,
      furniture: data.furniture || { placedModules: [] },
      thumbnail: data.thumbnail,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };

    console.log('🔍 디자인 파일 조회 완료 (공유):', {
      id: designFile.id,
      name: designFile.name,
      furniture: designFile.furniture,
      placedModulesCount: designFile.furniture?.placedModules?.length || 0
    });

    return { designFile, error: null };
  } catch (error: any) {
    console.error('🔥 디자인 파일 조회 에러 (공유):', error);
    console.error('🔥 에러 코드:', error?.code);
    console.error('🔥 에러 메시지:', error?.message);
    
    // Firebase 권한 에러 체크
    if (error?.code === 'permission-denied') {
      return { designFile: null, error: 'Firebase 보안 규칙에 의해 접근이 거부되었습니다. Firestore 규칙을 확인하세요.' };
    }
    
    return { designFile: null, error: `디자인 파일을 불러오는 중 오류가 발생했습니다: ${error?.message || error}` };
  }
};

// 공유 링크용 - 인증 없이 프로젝트 조회
export const getProjectByIdPublic = async (projectId: string): Promise<{ project: any | null; error: string | null }> => {
  try {
    console.log('🔥 [Firebase] getProjectByIdPublic 호출 (공유 링크):', projectId);

    const docRef = doc(db, PROJECTS_COLLECTION, projectId);
    console.log('🔥 [Firebase] 프로젝트 문서 참조 경로:', docRef.path);
    
    const docSnap = await getDocFromServer(docRef);
    console.log('🔥 [Firebase] 프로젝트 문서 스냅샷:', docSnap);
    console.log('🔥 [Firebase] 프로젝트 문서 존재 여부:', docSnap.exists());

    if (!docSnap.exists()) {
      console.log('🔥 [Firebase] 프로젝트가 존재하지 않음 (공유)');
      return { project: null, error: '프로젝트를 찾을 수 없습니다.' };
    }

    const data = docSnap.data();

    // 전체 데이터 반환 (뷰어에서 필요한 모든 데이터 포함)
    const project = {
      id: docSnap.id,
      ...data,
      // 명시적으로 필요한 데이터 확인
      spaceConfig: data.spaceConfig || null,
      furniture: data.furniture || { placedModules: [] },
      stats: data.stats || { furnitureCount: 0 }
    };

    console.log('🔍 Firebase 프로젝트 조회 (공유):', {
      id: project.id,
      hasSpaceConfig: !!project.spaceConfig,
      furnitureCount: project.furniture?.placedModules?.length || 0
    });

    return { project, error: null };
  } catch (error: any) {
    console.error('🔥 프로젝트 불러오기 에러 (공유):', error);
    console.error('🔥 에러 코드:', error?.code);
    console.error('🔥 에러 메시지:', error?.message);
    
    // Firebase 권한 에러 체크
    if (error?.code === 'permission-denied') {
      return { project: null, error: 'Firebase 보안 규칙에 의해 접근이 거부되었습니다. Firestore 규칙을 확인하세요.' };
    }
    
    return { project: null, error: `프로젝트를 불러오는 중 오류가 발생했습니다: ${error?.message || error}` };
  }
};

// 폴더 데이터 타입
export interface FolderData {
  id: string;
  name: string;
  type: 'folder';
  children: {
    id: string;
    name: string;
    type: 'design' | 'file';
    projectId: string;
  }[];
  expanded?: boolean;
}

// 폴더 데이터 저장
export const saveFolderData = async (
  projectId: string, 
  folders: FolderData[]
): Promise<{ error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { error: '로그인이 필요합니다.' };
    }

    const folderDocRef = doc(db, 'projectFolders', `${user.uid}_${projectId}`);
    await setDoc(folderDocRef, {
      userId: user.uid,
      projectId: projectId,
      folders: folders,
      updatedAt: serverTimestamp()
    });

    return { error: null };
  } catch (error) {
    console.error('폴더 데이터 저장 에러:', error);
    return { error: '폴더 데이터 저장 중 오류가 발생했습니다.' };
  }
};

// 폴더 데이터 불러오기
export const loadFolderData = async (
  projectId: string
): Promise<{ folders: FolderData[]; error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { folders: [], error: '로그인이 필요합니다.' };
    }

    const folderDocRef = doc(db, 'projectFolders', `${user.uid}_${projectId}`);
    const docSnap = await getDocFromServer(folderDocRef);

    if (!docSnap.exists()) {
      return { folders: [], error: null };
    }

    const data = docSnap.data();
    return { folders: data.folders || [], error: null };
  } catch (error) {
    console.error('폴더 데이터 불러오기 에러:', error);
    return { folders: [], error: '폴더 데이터 불러오기 중 오류가 발생했습니다.' };
  }
}; 