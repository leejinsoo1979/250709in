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
  Timestamp
} from 'firebase/firestore';
import { db } from './config';
import { getCurrentUserAsync } from './auth';
import { FirebaseProject, CreateProjectData, ProjectSummary } from './types';

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
      projectData: projectData.projectData,
      spaceConfig: projectData.spaceConfig,
      furniture: projectData.furniture,
      stats: {
        furnitureCount: projectData.furniture.placedModules.length,
        lastOpenedAt: serverTimestamp() as Timestamp,
      },
    };

    const docRef = await addDoc(collection(db, PROJECTS_COLLECTION), newProject);
    return { id: docRef.id, error: null };
  } catch (error) {
    console.error('프로젝트 생성 에러:', error);
    return { id: null, error: '프로젝트 생성 중 오류가 발생했습니다.' };
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
    const docSnap = await getDoc(docRef);

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

    // 마지막 열람 시간 업데이트
    await updateLastOpenedAt(projectId);

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

// 프로젝트 삭제
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

    await deleteDoc(docRef);
    return { error: null };
  } catch (error) {
    console.error('프로젝트 삭제 에러:', error);
    return { error: '프로젝트 삭제 중 오류가 발생했습니다.' };
  }
};

// 사용자의 프로젝트 목록 가져오기
export const getUserProjects = async (): Promise<{ projects: ProjectSummary[]; error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { projects: [], error: '로그인이 필요합니다.' };
    }

    const q = query(
      collection(db, PROJECTS_COLLECTION),
      where('userId', '==', user.uid),
      orderBy('updatedAt', 'desc')
    );

    const querySnapshot = await getDocs(q);
    const projects: ProjectSummary[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      projects.push({
        id: doc.id,
        title: data.title,
        updatedAt: data.updatedAt,
        furnitureCount: data.stats?.furnitureCount || 0,
        spaceSize: {
          width: data.spaceConfig?.width || 0,
          height: data.spaceConfig?.height || 0,
          depth: data.spaceConfig?.depth || 0,
        },
        thumbnail: data.thumbnail, // 썸네일 추가
      });
    });

    return { projects, error: null };
  } catch (error) {
    console.error('프로젝트 목록 가져오기 에러:', error);
    return { projects: [], error: '프로젝트 목록을 가져오는 중 오류가 발생했습니다.' };
  }
};

// 마지막 열람 시간 업데이트 (내부 함수)
const updateLastOpenedAt = async (projectId: string) => {
  try {
    const docRef = doc(db, PROJECTS_COLLECTION, projectId);
    await updateDoc(docRef, {
      'stats.lastOpenedAt': serverTimestamp(),
    });
  } catch (error) {
    console.error('마지막 열람 시간 업데이트 에러:', error);
    // 이 에러는 무시 (중요하지 않음)
  }
}; 