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
  collectionGroup,
  onSnapshot
} from 'firebase/firestore';
import { db } from './config';
import { getCurrentUserAsync } from './auth';
import { FirebaseProject, CreateProjectData, ProjectSummary, CreateDesignFileData, DesignFile, DesignFileSummary } from './types';
import { FLAGS } from '@/flags';
import { listDesignFiles as repoListDesignFiles } from '@/services/designs.repo';
import { recordProjectHistory } from './projectHistory';
import { deductCredits } from './userProfiles';

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
    
    console.log('📸 프로젝트 생성 시 사용자 정보:', {
      uid: user.uid,
      displayName: user.displayName,
      email: user.email,
      photoURL: user.photoURL
    });

    const newProject: Omit<FirebaseProject, 'id'> = {
      userId: user.uid,
      userName: user.displayName || undefined,
      userEmail: user.email || undefined,
      userPhotoURL: user.photoURL || undefined,
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

// Helper function to recursively remove undefined values from an object
const removeUndefinedValues = (obj: any): any => {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(removeUndefinedValues);
  }
  
  if (typeof obj === 'object' && obj.constructor === Object) {
    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleaned[key] = removeUndefinedValues(value);
      }
    }
    return cleaned;
  }
  
  return obj;
};

// 디자인파일 생성
export const createDesignFile = async (data: CreateDesignFileData): Promise<{ id: string | null; error: string | null }> => {
  try {
    console.log('💾💾💾 [createDesignFile] 함수 시작!');
    console.log('💾 [createDesignFile] 입력 데이터:', {
      name: data.name,
      projectId: data.projectId,
      hasSpaceConfig: !!data.spaceConfig,
      hasFurniture: !!data.furniture,
      furnitureCount: data.furniture?.placedModules?.length || 0
    });
    
    // Firebase 인증 상태 체크
    console.log('💾 [createDesignFile] Firebase 인증 확인 중...');
    const user = await getCurrentUserAsync();
    if (!user) {
      console.error('🚫🚫🚫 [createDesignFile] 사용자 인증 실패 - 로그인되지 않음');
      return { id: null, error: '로그인이 필요합니다.' };
    }

    console.log('👤 [createDesignFile] 인증된 사용자:', {
      uid: user.uid,
      email: user.email
    });

    // 크레딧 확인 및 차감
    console.log('💰 [createDesignFile] 크레딧 확인 중...');
    const { success, remainingCredits, error: creditError } = await deductCredits(20);
    if (!success) {
      console.error('🚫 [createDesignFile] 크레딧 부족:', creditError);
      return { id: null, error: creditError || '크레딧이 부족합니다.' };
    }
    console.log('✅ [createDesignFile] 크레딧 차감 완료. 남은 크레딧:', remainingCredits);

    const teamId = await getActiveTeamId();
    const now = serverTimestamp() as Timestamp;

    // 같은 프로젝트 내 중복 이름 체크 및 자동 사본 번호 부여
    let finalName = data.name;
    try {
      const { designFiles: existingFiles } = await getDesignFiles(data.projectId);
      const existingNames = new Set(existingFiles.map(f => f.name));

      if (existingNames.has(finalName)) {
        // 기본 이름에서 기존 사본 번호 패턴 제거 (예: "이름 사본2" → "이름")
        const baseName = finalName.replace(/ 사본\d*$/, '');
        let copyNum = 1;
        let candidate = `${baseName} 사본${copyNum}`;
        while (existingNames.has(candidate)) {
          copyNum++;
          candidate = `${baseName} 사본${copyNum}`;
        }
        finalName = candidate;
        console.log('📋 [createDesignFile] 중복 이름 감지, 자동 변경:', data.name, '→', finalName);
      }
    } catch (dupCheckError) {
      console.warn('⚠️ [createDesignFile] 중복 이름 체크 실패 (무시하고 원래 이름 사용):', dupCheckError);
    }

    // undefined 필드들을 제외한 데이터 생성
    // Firebase는 undefined 값을 허용하지 않으므로, 자동 계산이 필요한 필드는 제거
    const spaceConfigWithDefaults = { ...data.spaceConfig };

    // undefined 값을 가진 필드들을 제거 (Firebase는 undefined를 허용하지 않음)
    // 이 필드들은 나중에 자동 계산됨
    delete spaceConfigWithDefaults.mainDoorCount;
    delete spaceConfigWithDefaults.droppedCeilingDoorCount;
    delete spaceConfigWithDefaults.customColumnCount;

    console.log('🔧 [createDesignFile] undefined 필드 제거 후 spaceConfig:', {
      hasMainDoorCount: 'mainDoorCount' in spaceConfigWithDefaults,
      hasDroppedCeilingDoorCount: 'droppedCeilingDoorCount' in spaceConfigWithDefaults,
      hasCustomColumnCount: 'customColumnCount' in spaceConfigWithDefaults,
      keys: Object.keys(spaceConfigWithDefaults)
    });

    const baseData: any = {
      name: finalName,
      projectId: data.projectId,
      spaceConfig: spaceConfigWithDefaults,
      furniture: data.furniture,
      userId: user.uid,
      teamId: teamId || '',
      createdAt: now,
      updatedAt: now,
    };

    // isSpaceConfigured 필드가 있을 때만 추가
    if (data.isSpaceConfigured !== undefined) {
      baseData.isSpaceConfigured = data.isSpaceConfigured;
    }

    // thumbnail이 있을 때만 추가
    if (data.thumbnail !== undefined && data.thumbnail !== null) {
      baseData.thumbnail = data.thumbnail;
    }

    // folderId가 있을 때만 추가
    const designFileDataRaw: any = data.folderId 
      ? { ...baseData, folderId: data.folderId }
      : baseData;
    
    // Firebase는 undefined 값을 허용하지 않으므로 모든 undefined 값을 제거
    const designFileData = removeUndefinedValues(designFileDataRaw);
    
    console.log('🧹 [createDesignFile] undefined 값 제거 완료');
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
      console.log('💾 [createDesignFile] Firestore에 저장 시도 중...');
      console.log('💾 [createDesignFile] Collection: designFiles');
      console.log('💾 [createDesignFile] 저장할 데이터:', designFileData);
      
      try {
        docRef = await addDoc(collection(db, 'designFiles'), designFileData);
        designId = docRef.id;
        console.log('✅✅✅ [createDesignFile] Firestore 저장 성공!');
        console.log('✅ [createDesignFile] 생성된 문서 ID:', designId);
        console.log('✅ [createDesignFile] 문서 경로:', `designFiles/${designId}`);
      
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
      } catch (saveError: any) {
        console.error('🚫🚫🚫 [createDesignFile] Firestore 저장 실패!');
        console.error('🚫 [createDesignFile] 에러 객체:', saveError);
        console.error('🚫 [createDesignFile] 에러 코드:', saveError?.code);
        console.error('🚫 [createDesignFile] 에러 메시지:', saveError?.message);
        throw saveError;
      }
    }
    
    // 프로젝트 통계 업데이트
    await updateProjectStats(data.projectId);
    
    return { id: designId, error: null };
  } catch (error: any) {
    console.error('❌❌❌ [createDesignFile] 전체 함수 에러!');
    console.error('❌ [createDesignFile] 에러 타입:', error?.constructor?.name);
    console.error('❌ [createDesignFile] 에러 코드:', error?.code);
    console.error('❌ [createDesignFile] 에러 메시지:', error?.message);
    console.error('❌ [createDesignFile] 전체 에러 객체:', error);
    
    let errorMessage = '디자인파일 생성 중 오류가 발생했습니다.';
    
    // Firebase 권한 에러 체크
    if (error?.code === 'permission-denied') {
      errorMessage = 'Firebase 권한이 없습니다. 관리자에게 문의하세요.';
    } else if (error?.code === 'unauthenticated') {
      errorMessage = '인증이 필요합니다. 다시 로그인해주세요.';
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }
    
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
    // 비로그인 사용자도 프로젝트 조회 가능 (공유 링크 지원)

    const docRef = doc(db, PROJECTS_COLLECTION, projectId);
    const docSnap = await getDocFromServer(docRef);

    if (!docSnap.exists()) {
      return { project: null, error: '프로젝트를 찾을 수 없습니다.' };
    }

    const data = docSnap.data();

    // 로그인한 사용자이고 소유자가 아니면 권한 확인 (공유 권한 체크)
    // 비로그인 사용자는 읽기만 가능
    if (user && data.userId !== user.uid) {
      // 공유받은 프로젝트인지 확인 (향후 구현 가능)
      // 현재는 모든 로그인 사용자가 조회 가능
    }

    const project: FirebaseProject = {
      id: docSnap.id,
      ...data,
    } as FirebaseProject;

    // 마지막 열람 시간 업데이트 (로그인한 소유자만)
    // if (user && data.userId === user.uid) {
    //   await updateLastOpenedAt(projectId);
    // }

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
    // 비로그인 사용자도 프로젝트 조회 가능 (공유 링크 지원)

    const docRef = doc(db, PROJECTS_COLLECTION, projectId);
    const docSnap = await getDocFromServer(docRef);

    if (!docSnap.exists()) {
      return { project: null, error: '프로젝트를 찾을 수 없습니다.' };
    }

    const data = docSnap.data();

    // 로그인한 사용자이고 소유자가 아니면 권한 확인 (공유 권한 체크)
    // 비로그인 사용자는 읽기만 가능
    if (user && data.userId !== user.uid) {
      // 공유받은 프로젝트인지 확인 (향후 구현 가능)
      // 현재는 모든 로그인 사용자가 조회 가능
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
    
    // 먼저 소유자이거나 공유 접근 권한이 있는지 확인 (서버에서 직접 가져오기)
    const docSnap = await getDocFromServer(docRef);
    if (!docSnap.exists()) {
      return { error: '프로젝트를 찾을 수 없습니다.' };
    }

    const isOwner = docSnap.data().userId === user.uid;
    const { isSuperAdmin } = await import('./admins');
    const isSuper = isSuperAdmin(user.email || '');

    if (!isOwner && !isSuper) {
      // 소유자나 슈퍼어드민이 아니면 공유 접근 권한 확인 (editor 권한만 수정 가능)
      const sharedAccessQuery = query(
        collection(db, 'sharedProjectAccess'),
        where('userId', '==', user.uid),
        where('projectId', '==', projectId),
        where('isActive', '==', true)
      );
      const sharedAccessSnap = await getDocs(sharedAccessQuery);

      if (sharedAccessSnap.empty) {
        return { error: '프로젝트에 접근할 권한이 없습니다.' };
      }

      // editor 권한이 있는지 확인
      const sharedAccess = sharedAccessSnap.docs[0].data();
      if (sharedAccess.permission !== 'editor') {
        return { error: '프로젝트를 수정할 권한이 없습니다.' };
      }

      console.log('✅ [Firebase] 공유 편집 권한 확인됨');
    }

    const updateData: Record<string, any> = {
      updatedAt: serverTimestamp(),
      ...(updates.title && { title: updates.title }),
      ...(updates.projectData && { projectData: updates.projectData }),
      ...(updates.spaceConfig && { spaceConfig: updates.spaceConfig }),
      ...(updates.furniture && {
        furniture: updates.furniture,
        'stats.furnitureCount': updates.furniture.placedModules.length
      }),
      ...(thumbnail && { thumbnail }),
      ...((updates as any).status && { status: (updates as any).status }),
    };

    if (updates.spaceConfig) {
      console.log('🔥 Firebase 저장 - spaceConfig 입력:', updates.spaceConfig);
      console.log('🔥 Firebase 저장 - materialConfig 입력:', updates.spaceConfig.materialConfig);
    }

    console.log('🔥 Firebase 저장 - 최종 updateData:', updateData);

    // 기존 데이터 가져오기 (변경 이력을 위해)
    const oldData = docSnap.data();

    await updateDoc(docRef, updateData);

    // 저장 후 실제 저장된 데이터 확인
    const verifyDocSnap = await getDoc(docRef);
    if (verifyDocSnap.exists()) {
      const savedData = verifyDocSnap.data();
      console.log('🔥 Firebase 저장 후 확인 - spaceConfig:', savedData.spaceConfig);
      console.log('🔥 Firebase 저장 후 확인 - materialConfig:', savedData.spaceConfig?.materialConfig);
    }

    // 변경 이력 기록
    try {
      let changeDescription = '';
      if (updates.title) changeDescription = '프로젝트 제목 변경';
      else if (updates.spaceConfig) changeDescription = '공간 설정 변경';
      else if (updates.furniture) changeDescription = '가구 배치 변경';
      else if (thumbnail) changeDescription = '썸네일 업데이트';
      else changeDescription = '프로젝트 정보 변경';

      await recordProjectHistory(
        projectId,
        oldData.title || '제목 없음',
        'project_updated',
        user.uid,
        user.displayName || user.email || '사용자',
        user.email,
        {
          description: changeDescription,
        }
      );
    } catch (historyError) {
      console.error('변경 이력 기록 실패:', historyError);
      // 이력 기록 실패는 주요 기능에 영향 없음
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
    
    // 1. 팀 스코프 경로 확인 (400 에러 방지를 위해 try-catch)
    if (FLAGS.teamScope) {
      try {
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
      } catch (teamError) {
        console.log('팀 스코프 경로 확인 실패 (무시하고 legacy로 진행):', teamError);
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
    
    // 소유자 또는 슈퍼어드민 확인
    const { isSuperAdmin: isSuperAdminCheck } = await import('./admins');
    if (projectData.userId !== user.uid && !isSuperAdminCheck(user.email || '')) {
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
    updatedAt?: string;
    projectData?: any;
    isSpaceConfigured?: boolean;
    folderId?: string | null;
  }
): Promise<{ error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
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
    }
    
    // 2. Legacy에서 못 찾았으면 team-scoped path 시도 (400 에러 방지를 위해 try-catch)
    if (!designDocRef) {
      try {
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
          }
        }
      } catch (teamError) {
        console.log('팀 스코프 디자인 경로 확인 실패 (무시하고 진행):', teamError);
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
        }
      }
    }
    
    // 디자인 파일을 찾지 못한 경우
    if (!designDocRef || !designData) {
      console.error('🔥 [updateDesignFile] 디자인파일을 찾을 수 없음:', designFileId);
      return { error: '디자인파일을 찾을 수 없습니다.' };
    }

    // ✅ 권한 확인: 파일 소유자, 슈퍼어드민, 또는 프로젝트 편집 권한이 있어야 함
    const { isSuperAdmin: isSuperCheck } = await import('./admins');
    const isSuperUser = isSuperCheck(user.email || '');

    if (!isSuperUser) {
      // userId가 없거나 현재 사용자와 일치하지 않는 경우
      if (designData.userId && user.uid !== designData.userId) {
        // sharedProjectAccess에서 편집 권한 확인
        const accessId = `${projectId}_${user.uid}`;
        const accessRef = doc(db, 'sharedProjectAccess', accessId);
        const accessSnap = await getDocFromServer(accessRef);

        if (!accessSnap.exists()) {
          return { error: '이 디자인 파일을 수정할 권한이 없습니다. 파일 소유자이거나 프로젝트 편집 권한이 필요합니다.' };
        }

        const accessData = accessSnap.data();
        if (accessData.permission !== 'editor') {
          return { error: '이 디자인 파일을 수정할 권한이 없습니다. 편집 권한이 필요합니다.' };
        }
      } else if (!designData.userId) {
        // userId가 없는 경우 프로젝트 소유자 확인
        const projectRef = doc(db, 'projects', projectId);
        const projectSnap = await getDocFromServer(projectRef);

        if (projectSnap.exists() && projectSnap.data().userId !== user.uid) {
          return { error: '이 디자인 파일을 수정할 권한이 없습니다.' };
        }
      }
    }

    // spaceConfig가 있는 경우 자동 계산 필드들을 제거
    let spaceConfigClean = undefined;
    if (updates.spaceConfig) {
      spaceConfigClean = { ...updates.spaceConfig };
      // Firebase는 undefined 값을 허용하지 않으므로 필드를 제거
      delete spaceConfigClean.mainDoorCount;
      delete spaceConfigClean.droppedCeilingDoorCount;
      delete spaceConfigClean.customColumnCount;
    }
    
    const updateDataRaw = {
      updatedAt: serverTimestamp(),
      ...(updates.name && { name: updates.name }),
      ...(updates.projectData && { projectData: updates.projectData }),
      ...(spaceConfigClean && { spaceConfig: spaceConfigClean }),
      ...(updates.furniture && { furniture: updates.furniture }),
      ...(updates.thumbnail && { thumbnail: updates.thumbnail }),
      ...(updates.folderId !== undefined && { folderId: updates.folderId }),
    };
    
    // Firebase는 undefined 값을 허용하지 않으므로 모든 undefined 값을 제거
    const updateData = removeUndefinedValues(updateDataRaw);

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
    
    // 디자인파일이 업데이트되면 해당 프로젝트의 썸네일도 업데이트
    if (updates.thumbnail && projectId) {
      try {
        const projectRef = doc(db, PROJECTS_COLLECTION, projectId);
        await updateDoc(projectRef, {
          thumbnail: updates.thumbnail,
          updatedAt: serverTimestamp()
        });
      } catch (projectUpdateError) {
        console.warn('프로젝트 썸네일 업데이트 실패:', projectUpdateError);
      }
    }

    return { error: null };
  } catch (error: any) {
    console.error('디자인파일 업데이트 에러:', error);
    
    // Firebase 에러 코드에 따른 구체적인 메시지
    let errorMessage = '디자인파일 업데이트 중 오류가 발생했습니다.';
    if (error.code === 'permission-denied') {
      errorMessage = '권한이 없습니다. 다시 로그인해주세요.';
    } else if (error.code === 'not-found') {
      errorMessage = '디자인파일을 찾을 수 없습니다.';
    } else if (error.code === 'unavailable') {
      errorMessage = 'Firebase 서비스에 연결할 수 없습니다.';
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    return { error: errorMessage };
  }
};

// 디자인파일 저장 (updateDesignFile의 별칭)
export const saveDesignFile = updateDesignFile;

// 디자인파일 삭제
export const deleteDesignFile = async (designFileId: string, projectId: string): Promise<{ error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { error: '로그인이 필요합니다.' };
    }

    const docRef = doc(db, 'designFiles', designFileId);

    // 디자인파일 정보 조회 (소유자 확인용)
    const designSnap = await getDocFromServer(docRef);
    if (!designSnap.exists()) {
      // 이미 삭제된 파일 (프로젝트 삭제 시 함께 삭제됨) → 성공으로 처리
      console.log(`디자인파일 이미 삭제됨: ${designFileId}`);
      return { error: null };
    }

    const designData = designSnap.data();

    // 디버깅: 디자인 파일 소유자 정보 확인
    console.log('🗑️🗑️🗑️ [deleteDesignFile] 디자인 파일 정보:', {
      designFileId,
      projectId,
      designFileName: designData.name,
      designFileUserId: designData.userId,
      currentUserId: user.uid,
      isOwner: user.uid === designData.userId,
      userIdExists: !!designData.userId
    });

    // ✅ 권한 확인: 파일 소유자, 슈퍼어드민, 또는 프로젝트 편집 권한이 있어야 함
    const { isSuperAdmin: isDeleteSuperCheck } = await import('./admins');
    const isDeleteSuper = isDeleteSuperCheck(user.email || '');

    if (!isDeleteSuper) {
      if (designData.userId && user.uid !== designData.userId) {
        // sharedProjectAccess에서 편집 권한 확인
        const accessId = `${projectId}_${user.uid}`;
        const accessRef = doc(db, 'sharedProjectAccess', accessId);
        const accessSnap = await getDocFromServer(accessRef);

        if (!accessSnap.exists()) {
          console.error('🚫 [deleteDesignFile] 공유 접근 권한 없음');
          return { error: '이 디자인 파일을 삭제할 권한이 없습니다. 파일 소유자이거나 프로젝트 편집 권한이 필요합니다.' };
        }

        const accessData = accessSnap.data();
        if (accessData.permission !== 'editor') {
          console.error('🚫 [deleteDesignFile] 편집 권한 없음');
          return { error: '이 디자인 파일을 삭제할 권한이 없습니다. 편집 권한이 필요합니다.' };
        }
      } else if (!designData.userId) {
        // userId가 없는 경우 프로젝트 소유자 확인
        console.warn('⚠️ [deleteDesignFile] 디자인 파일에 userId 없음, 프로젝트 소유자 확인');
        const projectRef = doc(db, 'projects', projectId);
        const projectSnap = await getDocFromServer(projectRef);

        if (projectSnap.exists() && projectSnap.data().userId !== user.uid) {
          console.error('🚫 [deleteDesignFile] 프로젝트 소유자 아님');
          return { error: '이 디자인 파일을 삭제할 권한이 없습니다.' };
        }
      }
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

// ── 소프트 삭제 (휴지통) ──

// 디자인파일 소프트 삭제 (휴지통으로 이동)
export const softDeleteDesignFile = async (designFileId: string, projectId: string): Promise<{ error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) return { error: '로그인이 필요합니다.' };

    const docRef = doc(db, 'designFiles', designFileId);
    const snap = await getDocFromServer(docRef);
    if (!snap.exists()) return { error: '디자인 파일을 찾을 수 없습니다.' };

    await updateDoc(docRef, {
      isDeleted: true,
      deletedAt: serverTimestamp(),
    });
    await updateProjectStats(projectId);
    return { error: null };
  } catch (error) {
    console.error('소프트 삭제 에러:', error);
    return { error: '삭제 중 오류가 발생했습니다.' };
  }
};

// 프로젝트 소프트 삭제 (휴지통으로 이동)
export const softDeleteProject = async (projectId: string): Promise<{ error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) return { error: '로그인이 필요합니다.' };

    const projectRef = doc(db, 'projects', projectId);
    const snap = await getDocFromServer(projectRef);
    if (!snap.exists()) return { error: '프로젝트를 찾을 수 없습니다.' };

    await updateDoc(projectRef, {
      isDeleted: true,
      deletedAt: serverTimestamp(),
    });
    return { error: null };
  } catch (error) {
    console.error('프로젝트 소프트 삭제 에러:', error);
    return { error: '삭제 중 오류가 발생했습니다.' };
  }
};

// 디자인파일 복원
export const restoreDesignFile = async (designFileId: string, projectId: string): Promise<{ error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) return { error: '로그인이 필요합니다.' };

    const docRef = doc(db, 'designFiles', designFileId);
    await updateDoc(docRef, {
      isDeleted: false,
      deletedAt: null,
    });
    await updateProjectStats(projectId);
    return { error: null };
  } catch (error) {
    console.error('복원 에러:', error);
    return { error: '복원 중 오류가 발생했습니다.' };
  }
};

// 프로젝트 복원
export const restoreProject = async (projectId: string): Promise<{ error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) return { error: '로그인이 필요합니다.' };

    const projectRef = doc(db, 'projects', projectId);
    await updateDoc(projectRef, {
      isDeleted: false,
      deletedAt: null,
    });
    return { error: null };
  } catch (error) {
    console.error('프로젝트 복원 에러:', error);
    return { error: '복원 중 오류가 발생했습니다.' };
  }
};

// 디자인파일 영구 삭제
export const permanentDeleteDesignFile = async (designFileId: string, projectId: string): Promise<{ error: string | null }> => {
  return deleteDesignFile(designFileId, projectId);
};

// 프로젝트 영구 삭제
export const permanentDeleteProject = async (projectId: string): Promise<{ error: string | null }> => {
  return deleteProject(projectId);
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

/**
 * 사용자의 프로젝트 목록 실시간 구독
 * @param userId 사용자 ID
 * @param callback 프로젝트 목록 변경 시 호출될 콜백
 * @returns 구독 취소 함수
 */
export function subscribeToUserProjects(
  userId: string,
  callback: (projects: ProjectSummary[]) => void,
  showAll: boolean = false
): () => void {
  // 슈퍼어드민(showAll=true)이면 userId 필터 없이 전체 프로젝트 구독
  const q = showAll
    ? query(
        collection(db, PROJECTS_COLLECTION),
        orderBy('updatedAt', 'desc')
      )
    : query(
        collection(db, PROJECTS_COLLECTION),
        where('userId', '==', userId),
        orderBy('updatedAt', 'desc')
      );

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const projects: ProjectSummary[] = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          title: data.title || '제목 없음',
          thumbnail: data.thumbnail || null,
          createdAt: data.createdAt || Timestamp.now(),
          updatedAt: data.updatedAt || Timestamp.now(),
          furnitureCount: data.stats?.furnitureCount || 0,
          spaceSize: {
            width: data.spaceConfig?.width || 0,
            height: data.spaceConfig?.height || 0,
            depth: data.spaceConfig?.depth || 0,
          },
          status: data.status || 'in_progress',
          userId: data.userId,
          isDeleted: data.isDeleted || false,
          deletedAt: data.deletedAt,
        };
      });

      console.log('🔔 프로젝트 실시간 업데이트:', projects.length, '개');
      callback(projects);
    },
    (error) => {
      console.error('❌ 프로젝트 구독 실패:', error);
      callback([]);
    }
  );

  return unsubscribe;
}

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

    // 관리자 권한 확인
    const { isSuperAdmin } = await import('./admins');
    const isAdmin = isSuperAdmin(user.email || '');
    if (isAdmin) {
      console.log('👑 [Firebase] 관리자 권한으로 디자인 파일 접근:', designFileId);
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

    // 관리자는 권한 체크 건너뛰고 바로 데이터 반환
    if (isAdmin) {
      console.log('👑 [Firebase] 관리자 - 권한 체크 건너뛰고 데이터 반환');
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
      return { designFile, error: null };
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
      if (teamPath && !isAdmin) {
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
      // root 프로젝트인 경우 소유자이거나 공유 접근 권한이 있는지 확인
      const projectData = projectSnap.data();
      const isOwner = projectData.userId === user.uid;

      if (!isOwner && !isAdmin) {
        // 소유자나 관리자가 아니면 공유 접근 권한 확인
        const sharedAccessQuery = query(
          collection(db, 'sharedProjectAccess'),
          where('userId', '==', user.uid),
          where('projectId', '==', data.projectId)
        );
        const sharedAccessSnap = await getDocs(sharedAccessQuery);

        if (sharedAccessSnap.empty) {
          console.log('🔥 [Firebase] 공유 접근 권한 없음');
          return { designFile: null, error: '디자인 파일에 접근할 권한이 없습니다.' };
        }

        // 디자인 파일별 권한 확인
        const accessDoc = sharedAccessSnap.docs[0];
        const accessData = accessDoc.data();
        const sharedDesignFileIds = accessData.designFileIds || [];

        // designFileIds가 있으면 해당 디자인만 접근 가능
        if (sharedDesignFileIds.length > 0 && !sharedDesignFileIds.includes(designFileId)) {
          console.log('🔥 [Firebase] 이 디자인 파일에 대한 접근 권한 없음:', {
            designFileId,
            sharedDesignFileIds
          });
          return { designFile: null, error: '이 디자인 파일에 접근할 권한이 없습니다.' };
        }

        console.log('✅ [Firebase] 공유 접근 권한 확인됨');
      }
    }

    console.log('🪑 [Firebase] 가구 데이터 처리 전:', {
      rawFurniture: data.furniture,
      hasFurniture: !!data.furniture,
      hasPlacedModules: !!data.furniture?.placedModules,
      placedModulesCount: data.furniture?.placedModules?.length || 0
    });
    
    // 상하부장 데이터 상세 확인
    if (data.furniture?.placedModules) {
      const upperCabinets = data.furniture.placedModules.filter((m: any) => 
        m.moduleId?.includes('upper-cabinet')
      );
      const lowerCabinets = data.furniture.placedModules.filter((m: any) => 
        m.moduleId?.includes('lower-cabinet')
      );
      
      console.log('🗄️ [Firebase] 상하부장 데이터 확인:', {
        totalModules: data.furniture.placedModules.length,
        upperCabinets: upperCabinets.length,
        lowerCabinets: lowerCabinets.length,
        upperCabinetDetails: upperCabinets.map((m: any) => ({
          id: m.id,
          moduleId: m.moduleId,
          slotIndex: m.slotIndex,
          position: m.position
        })),
        lowerCabinetDetails: lowerCabinets.map((m: any) => ({
          id: m.id,
          moduleId: m.moduleId,
          slotIndex: m.slotIndex,
          position: m.position
        }))
      });
    }
    
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
  createdAt?: number;
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