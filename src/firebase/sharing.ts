import { 
  collection, 
  doc, 
  addDoc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from './config';
import { getCurrentUserAsync } from './auth';
import { ProjectShare, ProjectSummary } from './types';
import { getProject } from './projects';

// 컬렉션 참조
const PROJECT_SHARES_COLLECTION = 'projectShares';

// 프로젝트 공유 (이메일로 직접 공유)
export const shareProjectWithUser = async (
  projectId: string,
  targetEmail: string,
  permission: 'viewer' | 'editor'
): Promise<{ shareId: string | null; error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { shareId: null, error: '로그인이 필요합니다.' };
    }

    // 프로젝트 소유권 확인
    const { project, error: projectError } = await getProject(projectId);
    if (projectError || !project) {
      return { shareId: null, error: projectError || '프로젝트를 찾을 수 없습니다.' };
    }

    if (project.userId !== user.uid) {
      return { shareId: null, error: '프로젝트를 공유할 권한이 없습니다.' };
    }

    // 자신에게 공유하는 것 방지
    if (targetEmail === user.email) {
      return { shareId: null, error: '자신에게는 공유할 수 없습니다.' };
    }

    // 이미 공유되었는지 확인
    const existingShareQuery = query(
      collection(db, PROJECT_SHARES_COLLECTION),
      where('projectId', '==', projectId),
      where('sharedWith', '==', targetEmail),
      where('isActive', '==', true)
    );
    const existingShares = await getDocs(existingShareQuery);
    if (!existingShares.empty) {
      return { shareId: null, error: '이미 이 사용자와 공유된 프로젝트입니다.' };
    }

    const shareData: Omit<ProjectShare, 'id'> = {
      projectId,
      projectTitle: project.title,
      ownerId: user.uid,
      ownerEmail: user.email || '',
      sharedWith: targetEmail,
      permission,
      shareType: 'email',
      createdAt: serverTimestamp() as Timestamp,
      isActive: true
    };

    const docRef = await addDoc(collection(db, PROJECT_SHARES_COLLECTION), shareData);
    return { shareId: docRef.id, error: null };
  } catch (error) {
    console.error('프로젝트 공유 에러:', error);
    return { shareId: null, error: '프로젝트 공유 중 오류가 발생했습니다.' };
  }
};

// 링크 공유 생성
export const createShareLink = async (
  projectId: string,
  permission: 'viewer' | 'editor',
  expiresInDays?: number
): Promise<{ shareLink: string | null; error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { shareLink: null, error: '로그인이 필요합니다.' };
    }

    // 프로젝트 소유권 확인
    const { project, error: projectError } = await getProject(projectId);
    if (projectError || !project) {
      return { shareLink: null, error: projectError || '프로젝트를 찾을 수 없습니다.' };
    }

    if (project.userId !== user.uid) {
      return { shareLink: null, error: '프로젝트 공유 링크를 생성할 권한이 없습니다.' };
    }

    // 액세스 토큰 생성
    const accessToken = generateAccessToken();
    
    // 만료일 설정 (기본 30일)
    let expiresAt: Timestamp | undefined;
    if (expiresInDays) {
      const expireDate = new Date();
      expireDate.setDate(expireDate.getDate() + expiresInDays);
      expiresAt = Timestamp.fromDate(expireDate);
    }

    const shareData: Omit<ProjectShare, 'id'> = {
      projectId,
      projectTitle: project.title,
      ownerId: user.uid,
      ownerEmail: user.email || '',
      sharedWith: 'public', // 링크 공유는 특정 사용자가 아님
      permission,
      shareType: 'link',
      accessToken,
      createdAt: serverTimestamp() as Timestamp,
      expiresAt,
      isActive: true
    };

    const docRef = await addDoc(collection(db, PROJECT_SHARES_COLLECTION), shareData);
    
    // 공유 링크 생성
    const baseUrl = window.location.origin;
    const shareLink = `${baseUrl}/shared/${docRef.id}?token=${accessToken}`;
    
    return { shareLink, error: null };
  } catch (error) {
    console.error('공유 링크 생성 에러:', error);
    return { shareLink: null, error: '공유 링크 생성 중 오류가 발생했습니다.' };
  }
};

// 공유 링크로 프로젝트 접근
export const accessSharedProject = async (
  shareId: string,
  token: string
): Promise<{ project: ProjectSummary | null; permission: string | null; error: string | null }> => {
  try {
    const shareRef = doc(db, PROJECT_SHARES_COLLECTION, shareId);
    const shareSnap = await getDoc(shareRef);

    if (!shareSnap.exists()) {
      return { project: null, permission: null, error: '공유 링크를 찾을 수 없습니다.' };
    }

    const shareData = shareSnap.data() as ProjectShare;

    // 토큰 확인
    if (shareData.accessToken !== token) {
      return { project: null, permission: null, error: '유효하지 않은 공유 링크입니다.' };
    }

    // 활성 상태 확인
    if (!shareData.isActive) {
      return { project: null, permission: null, error: '비활성화된 공유 링크입니다.' };
    }

    // 만료 확인
    if (shareData.expiresAt && shareData.expiresAt.toDate() < new Date()) {
      return { project: null, permission: null, error: '만료된 공유 링크입니다.' };
    }

    // 프로젝트 정보 가져오기 (간단한 정보만)
    const { project, error: projectError } = await getProject(shareData.projectId);
    if (projectError || !project) {
      return { project: null, permission: null, error: '공유된 프로젝트를 찾을 수 없습니다.' };
    }

    const projectSummary: ProjectSummary = {
      id: project.id,
      title: project.title,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      furnitureCount: 0, // 필요시 계산
      spaceSize: { width: 0, height: 0, depth: 0 }, // 필요시 계산
      thumbnail: undefined // 필요시 추가
    };

    return { project: projectSummary, permission: shareData.permission, error: null };
  } catch (error) {
    console.error('공유 프로젝트 접근 에러:', error);
    return { project: null, permission: null, error: '공유 프로젝트 접근 중 오류가 발생했습니다.' };
  }
};

// 사용자가 공유한 프로젝트 목록
export const getSharedByMeProjects = async (): Promise<{ shares: ProjectShare[]; error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { shares: [], error: '로그인이 필요합니다.' };
    }

    const q = query(
      collection(db, PROJECT_SHARES_COLLECTION),
      where('ownerId', '==', user.uid),
      where('isActive', '==', true),
      orderBy('createdAt', 'desc')
    );

    const querySnapshot = await getDocs(q);
    const shares: ProjectShare[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      shares.push({
        id: doc.id,
        ...data,
      } as ProjectShare);
    });

    return { shares, error: null };
  } catch (error) {
    console.error('공유한 프로젝트 목록 가져오기 에러:', error);
    return { shares: [], error: '공유한 프로젝트 목록을 가져오는 중 오류가 발생했습니다.' };
  }
};

// 사용자가 공유받은 프로젝트 목록
export const getSharedWithMeProjects = async (): Promise<{ shares: ProjectShare[]; error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { shares: [], error: '로그인이 필요합니다.' };
    }

    const q = query(
      collection(db, PROJECT_SHARES_COLLECTION),
      where('sharedWith', '==', user.email),
      where('isActive', '==', true),
      orderBy('createdAt', 'desc')
    );

    const querySnapshot = await getDocs(q);
    const shares: ProjectShare[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      shares.push({
        id: doc.id,
        ...data,
      } as ProjectShare);
    });

    return { shares, error: null };
  } catch (error) {
    console.error('공유받은 프로젝트 목록 가져오기 에러:', error);
    return { shares: [], error: '공유받은 프로젝트 목록을 가져오는 중 오류가 발생했습니다.' };
  }
};

// 공유 취소
export const revokeProjectShare = async (shareId: string): Promise<{ error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { error: '로그인이 필요합니다.' };
    }

    const shareRef = doc(db, PROJECT_SHARES_COLLECTION, shareId);
    const shareSnap = await getDoc(shareRef);

    if (!shareSnap.exists()) {
      return { error: '공유를 찾을 수 없습니다.' };
    }

    const shareData = shareSnap.data() as ProjectShare;

    // 소유자만 공유를 취소할 수 있음
    if (shareData.ownerId !== user.uid) {
      return { error: '공유를 취소할 권한이 없습니다.' };
    }

    // 공유 비활성화
    await updateDoc(shareRef, {
      isActive: false
    });

    return { error: null };
  } catch (error) {
    console.error('공유 취소 에러:', error);
    return { error: '공유 취소 중 오류가 발생했습니다.' };
  }
};

// 공유 권한 변경
export const updateSharePermission = async (
  shareId: string,
  newPermission: 'viewer' | 'editor'
): Promise<{ error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { error: '로그인이 필요합니다.' };
    }

    const shareRef = doc(db, PROJECT_SHARES_COLLECTION, shareId);
    const shareSnap = await getDoc(shareRef);

    if (!shareSnap.exists()) {
      return { error: '공유를 찾을 수 없습니다.' };
    }

    const shareData = shareSnap.data() as ProjectShare;

    // 소유자만 권한을 변경할 수 있음
    if (shareData.ownerId !== user.uid) {
      return { error: '권한을 변경할 수 없습니다.' };
    }

    await updateDoc(shareRef, {
      permission: newPermission
    });

    return { error: null };
  } catch (error) {
    console.error('공유 권한 변경 에러:', error);
    return { error: '공유 권한 변경 중 오류가 발생했습니다.' };
  }
};

// 특정 프로젝트의 공유 목록 가져오기
export const getProjectShares = async (projectId: string): Promise<{ shares: ProjectShare[]; error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { shares: [], error: '로그인이 필요합니다.' };
    }

    // 프로젝트 소유권 확인
    const { project, error: projectError } = await getProject(projectId);
    if (projectError || !project) {
      return { shares: [], error: projectError || '프로젝트를 찾을 수 없습니다.' };
    }

    if (project.userId !== user.uid) {
      return { shares: [], error: '프로젝트의 공유 목록을 볼 권한이 없습니다.' };
    }

    const q = query(
      collection(db, PROJECT_SHARES_COLLECTION),
      where('projectId', '==', projectId),
      where('isActive', '==', true),
      orderBy('createdAt', 'desc')
    );

    const querySnapshot = await getDocs(q);
    const shares: ProjectShare[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      shares.push({
        id: doc.id,
        ...data,
      } as ProjectShare);
    });

    return { shares, error: null };
  } catch (error) {
    console.error('프로젝트 공유 목록 가져오기 에러:', error);
    return { shares: [], error: '프로젝트 공유 목록을 가져오는 중 오류가 발생했습니다.' };
  }
};

// 액세스 토큰 생성 유틸리티
function generateAccessToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}