import { 
  collection, 
  addDoc, 
  getDocs, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from './config';
import { getCurrentUserAsync } from './auth';
import { ProjectBookmark } from './types';
import { getProject } from './projects';

// 컬렉션 참조
const PROJECT_BOOKMARKS_COLLECTION = 'projectBookmarks';

// 프로젝트 북마크 추가
export const addProjectBookmark = async (
  projectId: string,
  bookmarkType: 'personal' | 'shared' = 'personal'
): Promise<{ bookmarkId: string | null; error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { bookmarkId: null, error: '로그인이 필요합니다.' };
    }

    // 프로젝트 정보 확인
    const { project, error: projectError } = await getProject(projectId);
    if (projectError || !project) {
      return { bookmarkId: null, error: projectError || '프로젝트를 찾을 수 없습니다.' };
    }

    // 이미 북마크되었는지 확인
    const existingBookmarkQuery = query(
      collection(db, PROJECT_BOOKMARKS_COLLECTION),
      where('userId', '==', user.uid),
      where('projectId', '==', projectId)
    );
    const existingBookmarks = await getDocs(existingBookmarkQuery);
    if (!existingBookmarks.empty) {
      return { bookmarkId: null, error: '이미 북마크된 프로젝트입니다.' };
    }

    const bookmarkData: Omit<ProjectBookmark, 'id'> = {
      userId: user.uid,
      projectId,
      projectTitle: project.title,
      projectOwnerId: project.userId,
      bookmarkType,
      createdAt: serverTimestamp() as Timestamp
    };

    const docRef = await addDoc(collection(db, PROJECT_BOOKMARKS_COLLECTION), bookmarkData);
    return { bookmarkId: docRef.id, error: null };
  } catch (error) {
    console.error('북마크 추가 에러:', error);
    return { bookmarkId: null, error: '북마크 추가 중 오류가 발생했습니다.' };
  }
};

// 프로젝트 북마크 제거
export const removeProjectBookmark = async (projectId: string): Promise<{ error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { error: '로그인이 필요합니다.' };
    }

    // 사용자의 해당 프로젝트 북마크 찾기
    const bookmarkQuery = query(
      collection(db, PROJECT_BOOKMARKS_COLLECTION),
      where('userId', '==', user.uid),
      where('projectId', '==', projectId)
    );
    const bookmarkSnapshot = await getDocs(bookmarkQuery);

    if (bookmarkSnapshot.empty) {
      return { error: '북마크를 찾을 수 없습니다.' };
    }

    // 북마크 삭제 (일반적으로 하나만 있어야 하지만 혹시 모를 중복 제거)
    const deletePromises = bookmarkSnapshot.docs.map(doc => deleteDoc(doc.ref));
    await Promise.all(deletePromises);

    return { error: null };
  } catch (error) {
    console.error('북마크 제거 에러:', error);
    return { error: '북마크 제거 중 오류가 발생했습니다.' };
  }
};

// 사용자의 북마크 목록 가져오기
export const getUserBookmarks = async (): Promise<{ bookmarks: ProjectBookmark[]; error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { bookmarks: [], error: '로그인이 필요합니다.' };
    }

    const q = query(
      collection(db, PROJECT_BOOKMARKS_COLLECTION),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const querySnapshot = await getDocs(q);
    const bookmarks: ProjectBookmark[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      bookmarks.push({
        id: doc.id,
        ...data,
      } as ProjectBookmark);
    });

    return { bookmarks, error: null };
  } catch (error) {
    console.error('북마크 목록 가져오기 에러:', error);
    return { bookmarks: [], error: '북마크 목록을 가져오는 중 오류가 발생했습니다.' };
  }
};

// 개인 프로젝트 북마크만 가져오기
export const getPersonalBookmarks = async (): Promise<{ bookmarks: ProjectBookmark[]; error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { bookmarks: [], error: '로그인이 필요합니다.' };
    }

    const q = query(
      collection(db, PROJECT_BOOKMARKS_COLLECTION),
      where('userId', '==', user.uid),
      where('bookmarkType', '==', 'personal'),
      orderBy('createdAt', 'desc')
    );

    const querySnapshot = await getDocs(q);
    const bookmarks: ProjectBookmark[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      bookmarks.push({
        id: doc.id,
        ...data,
      } as ProjectBookmark);
    });

    return { bookmarks, error: null };
  } catch (error) {
    console.error('개인 북마크 목록 가져오기 에러:', error);
    return { bookmarks: [], error: '개인 북마크 목록을 가져오는 중 오류가 발생했습니다.' };
  }
};

// 공유 프로젝트 북마크만 가져오기
export const getSharedBookmarks = async (): Promise<{ bookmarks: ProjectBookmark[]; error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { bookmarks: [], error: '로그인이 필요합니다.' };
    }

    const q = query(
      collection(db, PROJECT_BOOKMARKS_COLLECTION),
      where('userId', '==', user.uid),
      where('bookmarkType', '==', 'shared'),
      orderBy('createdAt', 'desc')
    );

    const querySnapshot = await getDocs(q);
    const bookmarks: ProjectBookmark[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      bookmarks.push({
        id: doc.id,
        ...data,
      } as ProjectBookmark);
    });

    return { bookmarks, error: null };
  } catch (error) {
    console.error('공유 북마크 목록 가져오기 에러:', error);
    return { bookmarks: [], error: '공유 북마크 목록을 가져오는 중 오류가 발생했습니다.' };
  }
};

// 프로젝트가 북마크되었는지 확인
export const isProjectBookmarked = async (projectId: string): Promise<{ isBookmarked: boolean; error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { isBookmarked: false, error: '로그인이 필요합니다.' };
    }

    const bookmarkQuery = query(
      collection(db, PROJECT_BOOKMARKS_COLLECTION),
      where('userId', '==', user.uid),
      where('projectId', '==', projectId)
    );
    const bookmarkSnapshot = await getDocs(bookmarkQuery);

    return { isBookmarked: !bookmarkSnapshot.empty, error: null };
  } catch (error) {
    console.error('북마크 상태 확인 에러:', error);
    return { isBookmarked: false, error: '북마크 상태 확인 중 오류가 발생했습니다.' };
  }
};

// 북마크 토글 (있으면 제거, 없으면 추가)
export const toggleProjectBookmark = async (
  projectId: string,
  bookmarkType: 'personal' | 'shared' = 'personal'
): Promise<{ isBookmarked: boolean; error: string | null }> => {
  try {
    const { isBookmarked, error: checkError } = await isProjectBookmarked(projectId);
    if (checkError) {
      return { isBookmarked: false, error: checkError };
    }

    if (isBookmarked) {
      const { error: removeError } = await removeProjectBookmark(projectId);
      if (removeError) {
        return { isBookmarked: true, error: removeError };
      }
      return { isBookmarked: false, error: null };
    } else {
      const { error: addError } = await addProjectBookmark(projectId, bookmarkType);
      if (addError) {
        return { isBookmarked: false, error: addError };
      }
      return { isBookmarked: true, error: null };
    }
  } catch (error) {
    console.error('북마크 토글 에러:', error);
    return { isBookmarked: false, error: '북마크 토글 중 오류가 발생했습니다.' };
  }
};

// 북마크 통계 가져오기
export const getBookmarkStats = async (): Promise<{ 
  totalBookmarks: number; 
  personalBookmarks: number; 
  sharedBookmarks: number; 
  error: string | null 
}> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { 
        totalBookmarks: 0, 
        personalBookmarks: 0, 
        sharedBookmarks: 0, 
        error: '로그인이 필요합니다.' 
      };
    }

    // 전체 북마크 수
    const totalQuery = query(
      collection(db, PROJECT_BOOKMARKS_COLLECTION),
      where('userId', '==', user.uid)
    );
    const totalSnapshot = await getDocs(totalQuery);
    const totalBookmarks = totalSnapshot.size;

    // 개인 북마크 수
    const personalQuery = query(
      collection(db, PROJECT_BOOKMARKS_COLLECTION),
      where('userId', '==', user.uid),
      where('bookmarkType', '==', 'personal')
    );
    const personalSnapshot = await getDocs(personalQuery);
    const personalBookmarks = personalSnapshot.size;

    // 공유 북마크 수
    const sharedQuery = query(
      collection(db, PROJECT_BOOKMARKS_COLLECTION),
      where('userId', '==', user.uid),
      where('bookmarkType', '==', 'shared')
    );
    const sharedSnapshot = await getDocs(sharedQuery);
    const sharedBookmarks = sharedSnapshot.size;

    return {
      totalBookmarks,
      personalBookmarks,
      sharedBookmarks,
      error: null
    };
  } catch (error) {
    console.error('북마크 통계 가져오기 에러:', error);
    return {
      totalBookmarks: 0,
      personalBookmarks: 0,
      sharedBookmarks: 0,
      error: '북마크 통계를 가져오는 중 오류가 발생했습니다.'
    };
  }
};