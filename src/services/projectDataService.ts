/**
 * 프로젝트 데이터 Firebase 연동 서비스
 * 완벽한 DB 구조를 지원하는 CRUD 작업
 */

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
  writeBatch,
  onSnapshot,
  DocumentReference,
  QuerySnapshot,
  DocumentSnapshot
} from 'firebase/firestore';
import { db, storage } from '@/firebase/config';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { getCurrentUserAsync } from '@/firebase/auth';
import { 
  ProjectData, 
  CreateProjectData, 
  UpdateProjectData, 
  ProjectSummary,
  ProjectBasicInfo,
  SpaceConfiguration,
  CustomLayoutConfiguration
} from '@/types/project';

// ========================
// 상수 정의
// ========================

const PROJECTS_COLLECTION = 'projects';
const THUMBNAILS_STORAGE_PATH = 'project-thumbnails';

// ========================
// 유틸리티 함수
// ========================

/**
 * 객체에서 undefined 값을 재귀적으로 제거
 * Firestore는 undefined를 지원하지 않으므로 필수
 */
const removeUndefinedValues = (obj: any): any => {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => removeUndefinedValues(item));
  }
  
  if (typeof obj === 'object' && obj.constructor === Object) {
    const cleaned: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        if (value !== undefined) {
          cleaned[key] = removeUndefinedValues(value);
        }
      }
    }
    return cleaned;
  }
  
  return obj;
};

// ========================
// 타입 정의
// ========================

interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

interface FirebaseProjectData extends Omit<ProjectData, 'id'> {
  // Firebase Timestamp 타입으로 변환
  basicInfo: Omit<ProjectBasicInfo, 'createdAt' | 'updatedAt'> & {
    createdAt: Timestamp;
    updatedAt: Timestamp;
  };
}

// ========================
// 프로젝트 생성
// ========================

export const createProject = async (
  projectData: CreateProjectData,
  thumbnailBlob?: Blob,
  options?: { skipThumbnail?: boolean }
): Promise<ServiceResponse<string>> => {
  try {
    console.log('🔍 createProject 호출됨, projectData:', projectData);
    
    if (!projectData || !projectData.basicInfo) {
      console.error('❌ basicInfo가 없습니다:', projectData);
      return { success: false, error: 'basicInfo가 필요합니다.' };
    }
    
    const user = await getCurrentUserAsync();
    if (!user) {
      return { success: false, error: '로그인이 필요합니다.' };
    }

    // 프로젝트 데이터 준비
    const now = serverTimestamp() as Timestamp;
    const newProjectData: FirebaseProjectData = {
      userId: user.uid,
      basicInfo: {
        ...projectData.basicInfo,
        createdAt: now,
        updatedAt: now,
      },
      spaceConfig: projectData.spaceConfig,
      customLayout: projectData.customLayout,
      metadata: {
        status: 'draft',
        priority: 'medium',
        tags: [],
        isFavorite: false,
      },
      stats: {
        designFileCount: 0,
        furnitureCount: 0,
        completionRate: 0,
        lastOpenedAt: now,
      },
      // furniture 필드 추가
      furniture: {
        placedModules: []
      }
    };

    // undefined 값 제거
    const cleanedProjectData = removeUndefinedValues(newProjectData);
    console.log('🧹 undefined 값 제거 후 데이터:', cleanedProjectData);

    // 프로젝트 문서 생성
    const projectRef = await addDoc(collection(db, PROJECTS_COLLECTION), cleanedProjectData);
    
    // 썸네일 업로드 (있는 경우 && 스킵 옵션이 없는 경우)
    let thumbnailUrl: string | undefined;
    if (thumbnailBlob && !options?.skipThumbnail) {
      try {
        thumbnailUrl = await uploadProjectThumbnail(projectRef.id, thumbnailBlob);
        await updateDoc(projectRef, { thumbnailUrl });
      } catch (thumbnailError) {
        console.warn('썸네일 업로드 실패:', thumbnailError);
        // 썸네일 업로드 실패는 프로젝트 생성을 막지 않음
      }
    } else if (options?.skipThumbnail) {
      console.log('📸 썸네일 업로드 스킵 (빠른 저장 모드)');
    }

    console.log('✅ 프로젝트 생성 완료:', {
      id: projectRef.id,
      title: projectData.basicInfo.title,
      thumbnailUrl
    });

    return { success: true, data: projectRef.id };
  } catch (error) {
    console.error('❌ 프로젝트 생성 실패:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : '프로젝트 생성 중 오류가 발생했습니다.' 
    };
  }
};

// ========================
// 프로젝트 조회
// ========================

export const getProject = async (projectId: string): Promise<ServiceResponse<ProjectData>> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { success: false, error: '로그인이 필요합니다.' };
    }

    const projectRef = doc(db, PROJECTS_COLLECTION, projectId);
    const projectSnap = await getDoc(projectRef);

    if (!projectSnap.exists()) {
      return { success: false, error: '프로젝트를 찾을 수 없습니다.' };
    }

    const firebaseData = projectSnap.data() as FirebaseProjectData;
    
    // 권한 확인
    if (firebaseData.userId !== user.uid) {
      return { success: false, error: '접근 권한이 없습니다.' };
    }

    // Firebase 데이터를 클라이언트 형식으로 변환
    const projectData: ProjectData = {
      id: projectSnap.id,
      ...firebaseData,
    };

    // 마지막 접근 시간 업데이트 (비동기적으로)
    updateDoc(projectRef, {
      'stats.lastOpenedAt': serverTimestamp(),
      'metadata.lastAccessedAt': serverTimestamp(),
    }).catch(console.warn);

    return { success: true, data: projectData };
  } catch (error) {
    console.error('❌ 프로젝트 조회 실패:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : '프로젝트 조회 중 오류가 발생했습니다.' 
    };
  }
};

// ========================
// 프로젝트 목록 조회
// ========================

export const getUserProjects = async (): Promise<ServiceResponse<ProjectSummary[]>> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { success: false, error: '로그인이 필요합니다.' };
    }

    const projectsQuery = query(
      collection(db, PROJECTS_COLLECTION),
      where('userId', '==', user.uid),
      orderBy('basicInfo.updatedAt', 'desc')
    );

    const querySnapshot = await getDocs(projectsQuery);
    const projects: ProjectSummary[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data() as FirebaseProjectData;
      projects.push({
        id: doc.id,
        basicInfo: data.basicInfo,
        metadata: data.metadata,
        stats: data.stats,
        thumbnailUrl: data.thumbnailUrl,
      });
    });

    return { success: true, data: projects };
  } catch (error) {
    console.error('❌ 프로젝트 목록 조회 실패:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : '프로젝트 목록 조회 중 오류가 발생했습니다.' 
    };
  }
};

// ========================
// 프로젝트 업데이트
// ========================

export const updateProject = async (
  projectId: string,
  updates: UpdateProjectData,
  thumbnailBlob?: Blob,
  options?: { skipThumbnail?: boolean }
): Promise<ServiceResponse<void>> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { success: false, error: '로그인이 필요합니다.' };
    }

    const projectRef = doc(db, PROJECTS_COLLECTION, projectId);
    
    // 권한 확인
    const projectSnap = await getDoc(projectRef);
    if (!projectSnap.exists()) {
      return { success: false, error: '프로젝트를 찾을 수 없습니다.' };
    }

    const existingData = projectSnap.data() as FirebaseProjectData;
    if (existingData.userId !== user.uid) {
      return { success: false, error: '수정 권한이 없습니다.' };
    }

    // 업데이트 데이터 준비
    const updateData: Partial<FirebaseProjectData> = {
      ...updates,
      basicInfo: updates.basicInfo ? {
        ...existingData.basicInfo,
        ...updates.basicInfo,
        updatedAt: serverTimestamp() as Timestamp,
      } : undefined,
    };

    // 썸네일 업데이트 (있는 경우 && 스킵 옵션이 없는 경우)
    if (thumbnailBlob && !options?.skipThumbnail) {
      try {
        const thumbnailUrl = await uploadProjectThumbnail(projectId, thumbnailBlob);
        updateData.thumbnailUrl = thumbnailUrl;
      } catch (thumbnailError) {
        console.warn('썸네일 업데이트 실패:', thumbnailError);
      }
    } else if (options?.skipThumbnail) {
      console.log('📸 썸네일 업데이트 스킵 (빠른 저장 모드)');
    }

    // undefined 값 제거
    const cleanedUpdateData = removeUndefinedValues(updateData);
    console.log('🧹 업데이트 데이터에서 undefined 값 제거:', cleanedUpdateData);
    
    // Firestore 업데이트
    await updateDoc(projectRef, cleanedUpdateData);

    console.log('✅ 프로젝트 업데이트 완료:', {
      projectId,
      updatedFields: Object.keys(updateData)
    });

    return { success: true };
  } catch (error) {
    console.error('❌ 프로젝트 업데이트 실패:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : '프로젝트 업데이트 중 오류가 발생했습니다.' 
    };
  }
};

// ========================
// 프로젝트 삭제
// ========================

export const deleteProject = async (projectId: string): Promise<ServiceResponse<void>> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { success: false, error: '로그인이 필요합니다.' };
    }

    const projectRef = doc(db, PROJECTS_COLLECTION, projectId);
    
    // 권한 확인
    const projectSnap = await getDoc(projectRef);
    if (!projectSnap.exists()) {
      return { success: false, error: '프로젝트를 찾을 수 없습니다.' };
    }

    const projectData = projectSnap.data() as FirebaseProjectData;
    if (projectData.userId !== user.uid) {
      return { success: false, error: '삭제 권한이 없습니다.' };
    }

    // 배치 작업으로 관련 데이터 모두 삭제
    const batch = writeBatch(db);
    
    // 프로젝트 문서 삭제
    batch.delete(projectRef);
    
    // 배치 실행
    await batch.commit();

    // 썸네일 이미지 삭제 (비동기적으로)
    if (projectData.thumbnailUrl) {
      deleteProjectThumbnail(projectId).catch(console.warn);
    }

    console.log('✅ 프로젝트 삭제 완료:', projectId);

    return { success: true };
  } catch (error) {
    console.error('❌ 프로젝트 삭제 실패:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : '프로젝트 삭제 중 오류가 발생했습니다.' 
    };
  }
};

// ========================
// 실시간 프로젝트 구독
// ========================

export const subscribeToProject = (
  projectId: string,
  callback: (project: ProjectData | null) => void,
  errorCallback?: (error: string) => void
): (() => void) => {
  const projectRef = doc(db, PROJECTS_COLLECTION, projectId);
  
  return onSnapshot(
    projectRef,
    (doc: DocumentSnapshot) => {
      if (doc.exists()) {
        const firebaseData = doc.data() as FirebaseProjectData;
        const projectData: ProjectData = {
          id: doc.id,
          ...firebaseData,
        };
        callback(projectData);
      } else {
        callback(null);
      }
    },
    (error) => {
      console.error('❌ 프로젝트 구독 에러:', error);
      errorCallback?.(error.message);
    }
  );
};

// ========================
// 썸네일 관리
// ========================

const uploadProjectThumbnail = async (projectId: string, blob: Blob): Promise<string> => {
  const thumbnailRef = ref(storage, `${THUMBNAILS_STORAGE_PATH}/${projectId}.jpg`);
  await uploadBytes(thumbnailRef, blob);
  return await getDownloadURL(thumbnailRef);
};

const deleteProjectThumbnail = async (projectId: string): Promise<void> => {
  try {
    const thumbnailRef = ref(storage, `${THUMBNAILS_STORAGE_PATH}/${projectId}.jpg`);
    await deleteObject(thumbnailRef);
  } catch (error) {
    // 파일이 존재하지 않는 경우는 무시
    if ((error as any)?.code !== 'storage/object-not-found') {
      throw error;
    }
  }
};

// ========================
// 데이터 검증 유틸리티
// ========================

export const validateProjectData = (data: Partial<ProjectData>): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  // 기본 정보 검증
  if (data.basicInfo) {
    if (!data.basicInfo.title?.trim()) {
      errors.push('프로젝트 제목은 필수입니다.');
    }
    if (!data.basicInfo.location?.trim()) {
      errors.push('설치 위치는 필수입니다.');
    }
  }

  // 공간 설정 검증
  if (data.spaceConfig) {
    const { dimensions, installType, wallPosition } = data.spaceConfig;
    
    if (dimensions) {
      if (dimensions.width <= 0) errors.push('공간 폭이 올바르지 않습니다.');
      if (dimensions.height <= 0) errors.push('공간 높이가 올바르지 않습니다.');
      if (dimensions.depth <= 0) errors.push('공간 깊이가 올바르지 않습니다.');
    }

    if (installType === 'standalone' && !wallPosition) {
      errors.push('세미스탠딩의 경우 벽 위치를 선택해야 합니다.');
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

// ========================
// 프로젝트 통계 업데이트
// ========================

export const updateProjectStats = async (
  projectId: string,
  stats: Partial<ProjectData['stats']>
): Promise<ServiceResponse<void>> => {
  try {
    const projectRef = doc(db, PROJECTS_COLLECTION, projectId);
    
    await updateDoc(projectRef, {
      'stats': stats,
      'basicInfo.updatedAt': serverTimestamp(),
    });

    return { success: true };
  } catch (error) {
    console.error('❌ 프로젝트 통계 업데이트 실패:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : '통계 업데이트 중 오류가 발생했습니다.' 
    };
  }
};