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
  getDocFromServer
} from 'firebase/firestore';
import { db } from './config';
import { getCurrentUserAsync } from './auth';
import { FirebaseProject, CreateProjectData, ProjectSummary, CreateDesignFileData, DesignFile, DesignFileSummary } from './types';

// 컬렉션 참조
const PROJECTS_COLLECTION = 'projects';

// 새 프로젝트 생성
export const createProject = async (projectData: CreateProjectData): Promise<{ id: string | null; error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { id: null, error: '로그인이 필요합니다.' };
    }

    const newProject: Omit<FirebaseProject, 'id'> = {
      userId: user.uid,
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
          placementType: 'floor',
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

    const docRef = await addDoc(collection(db, PROJECTS_COLLECTION), newProject);
    return { id: docRef.id, error: null };
  } catch (error) {
    console.error('프로젝트 생성 에러:', error);
    return { id: null, error: '프로젝트 생성 중 오류가 발생했습니다.' };
  }
};

// 디자인파일 생성
export const createDesignFile = async (data: CreateDesignFileData): Promise<{ id: string | null; error: string | null }> => {
  try {
    console.log('💾 createDesignFile 함수 호출됨:', data);
    
    const user = await getCurrentUserAsync();
    if (!user) {
      console.error('🚫 사용자 인증 실패');
      return { id: null, error: '로그인이 필요합니다.' };
    }

    console.log('👤 현재 사용자:', user.uid);

    // folderId가 undefined일 때 필드 제외
    const baseData = {
      name: data.name,
      projectId: data.projectId,
      spaceConfig: data.spaceConfig,
      furniture: data.furniture,
      createdAt: serverTimestamp() as Timestamp,
      updatedAt: serverTimestamp() as Timestamp,
    };
    
    const designFileData: any = data.folderId 
      ? { ...baseData, folderId: data.folderId }
      : baseData;
      
    console.log('📋 최종 Firestore 저장 데이터:', {
      ...designFileData,
      furnitureModulesCount: designFileData.furniture?.placedModules?.length || 0,
      spaceConfigKeys: designFileData.spaceConfig ? Object.keys(designFileData.spaceConfig) : []
    });

    const docRef = await addDoc(collection(db, 'designFiles'), designFileData);
    
    console.log('✅ Firestore 저장 성공, 문서 ID:', docRef.id);
    
    // 프로젝트 통계 업데이트
    await updateProjectStats(data.projectId);
    
    return { id: docRef.id, error: null };
  } catch (error) {
    console.error('❌ 디자인파일 생성 에러:', error);
    const errorMessage = error instanceof Error ? error.message : '디자인파일 생성 중 오류가 발생했습니다.';
    return { id: null, error: errorMessage };
  }
};

// 프로젝트의 디자인파일 목록 가져오기
export const getDesignFiles = async (projectId: string): Promise<{ designFiles: DesignFileSummary[]; error: string | null }> => {
  try {
    // 인덱스 없이 간단한 쿼리로 시작
    const q = query(
      collection(db, 'designFiles'),
      where('projectId', '==', projectId)
    );

    const querySnapshot = await getDocs(q);
    const designFiles: DesignFileSummary[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      designFiles.push({
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
        // 썸네일 생성을 위한 전체 데이터 추가
        spaceConfig: data.spaceConfig,
        furniture: data.furniture,
      });
    });

    // 수동으로 업데이트 시간순 정렬
    designFiles.sort((a, b) => b.updatedAt.seconds - a.updatedAt.seconds);

    return { designFiles, error: null };
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
    
    // 먼저 소유자 확인
    const docSnap = await getDoc(docRef);
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

    const docRef = doc(db, PROJECTS_COLLECTION, projectId);
    
    // 먼저 소유자 확인
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists() || docSnap.data().userId !== user.uid) {
      return { error: '프로젝트에 접근할 권한이 없습니다.' };
    }

    // 1. 프로젝트에 속한 모든 디자인파일 삭제
    const designFilesQuery = query(
      collection(db, 'designFiles'),
      where('projectId', '==', projectId)
    );
    const designFilesSnapshot = await getDocs(designFilesQuery);
    
    const deletePromises = designFilesSnapshot.docs.map(doc => deleteDoc(doc.ref));
    await Promise.all(deletePromises);

    // 2. 프로젝트 삭제
    await deleteDoc(docRef);
    
    console.log(`프로젝트 삭제 완료: ${projectId}, 디자인파일 ${designFilesSnapshot.size}개 함께 삭제`);
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

    const docRef = doc(db, 'designFiles', designFileId);
    
    // 디자인파일 존재 여부 확인
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      console.error('🔥 [updateDesignFile] 디자인파일 없음:', designFileId);
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
      hasUpdatedAt: !!updateData.updatedAt,
      keys: Object.keys(updateData),
      furnitureModulesCount: updateData.furniture?.placedModules?.length || 0
    });

    await updateDoc(docRef, updateData);
    
    // 저장 후 즉시 확인
    console.log('🔥 [updateDesignFile] 저장 직후 확인 시작');
    const verifyDoc = await getDoc(docRef);
    if (verifyDoc.exists()) {
      const savedData = verifyDoc.data();
      console.log('🔥 [updateDesignFile] 저장 직후 확인:', {
        savedFurnitureCount: savedData.furniture?.placedModules?.length || 0,
        savedUpdatedAt: savedData.updatedAt,
        savedSpaceConfigKeys: savedData.spaceConfig ? Object.keys(savedData.spaceConfig) : []
      });
    }
    
    // 디자인파일이 업데이트되면 해당 프로젝트의 썸네일도 업데이트
    if (updates.thumbnail) {
      const designFileData = docSnap.data();
      const projectId = designFileData.projectId;
      
      if (projectId) {
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
    const projectSnap = await getDoc(projectRef);
    
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
  try {
    // userId가 제공되면 사용하고, 그렇지 않으면 현재 사용자 확인
    let targetUserId = userId;
    if (!targetUserId) {
      const user = await getCurrentUserAsync();
      if (!user) {
        return { projects: [], error: '로그인이 필요합니다.' };
      }
      targetUserId = user.uid;
    }

    const q = query(
      collection(db, PROJECTS_COLLECTION),
      where('userId', '==', targetUserId),
      orderBy('updatedAt', 'desc')
    );

    const querySnapshot = await getDocs(q);
    const projects: ProjectSummary[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      console.log('🔍 Firebase 원본 프로젝트 데이터:', {
        id: doc.id,
        title: data.title,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        hasCreatedAt: 'createdAt' in data,
        hasUpdatedAt: 'updatedAt' in data
      });
      
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
        thumbnail: data.thumbnail, // 썸네일 추가
        folderId: data.folderId, // 폴더 ID 추가
      });
    });

    return { projects, error: null };
  } catch (error) {
    console.error('프로젝트 목록 가져오기 에러:', error);
    return { projects: [], error: '프로젝트 목록을 가져오는 중 오류가 발생했습니다.' };
  }
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
    
    // 디자인 파일이 속한 프로젝트의 소유자 확인
    const projectRef = doc(db, PROJECTS_COLLECTION, data.projectId);
    const projectSnap = await getDoc(projectRef);
    
    if (!projectSnap.exists() || projectSnap.data().userId !== user.uid) {
      return { designFile: null, error: '디자인 파일에 접근할 권한이 없습니다.' };
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
    const docSnap = await getDoc(folderDocRef);

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