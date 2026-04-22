import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from './config';
import { getCurrentUserAsync } from './auth';

export type NewsCategory = 'notice' | 'update';

export interface NewsItem {
  id: string;
  title: string;
  body: string;
  category: NewsCategory;
  authorId: string;
  authorName: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface CreateNewsData {
  title: string;
  body: string;
  category: NewsCategory;
}

const NEWS_COLLECTION = 'news';

/** 뉴스 목록 조회 (최신순) */
export const listNews = async (): Promise<{ items: NewsItem[]; error: string | null }> => {
  try {
    const q = query(collection(db, NEWS_COLLECTION), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    const items: NewsItem[] = snap.docs.map(d => ({
      id: d.id,
      ...(d.data() as Omit<NewsItem, 'id'>),
    }));
    return { items, error: null };
  } catch (e: any) {
    console.error('listNews 실패:', e);
    return { items: [], error: e?.message || '목록 조회 실패' };
  }
};

/** 단일 뉴스 조회 */
export const getNews = async (id: string): Promise<{ item: NewsItem | null; error: string | null }> => {
  try {
    const snap = await getDoc(doc(db, NEWS_COLLECTION, id));
    if (!snap.exists()) return { item: null, error: '게시글을 찾을 수 없습니다.' };
    return { item: { id: snap.id, ...(snap.data() as Omit<NewsItem, 'id'>) }, error: null };
  } catch (e: any) {
    console.error('getNews 실패:', e);
    return { item: null, error: e?.message || '조회 실패' };
  }
};

/** 뉴스 작성 */
export const createNews = async (data: CreateNewsData): Promise<{ id: string | null; error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) return { id: null, error: '로그인이 필요합니다.' };

    const now = serverTimestamp() as Timestamp;
    const ref = await addDoc(collection(db, NEWS_COLLECTION), {
      title: data.title,
      body: data.body,
      category: data.category,
      authorId: user.uid,
      authorName: user.displayName || user.email || '관리자',
      createdAt: now,
      updatedAt: now,
    });
    return { id: ref.id, error: null };
  } catch (e: any) {
    console.error('createNews 실패:', e);
    return { id: null, error: e?.message || '작성 실패' };
  }
};

/** 뉴스 수정 */
export const updateNews = async (id: string, data: Partial<CreateNewsData>): Promise<{ error: string | null }> => {
  try {
    await updateDoc(doc(db, NEWS_COLLECTION, id), {
      ...data,
      updatedAt: serverTimestamp(),
    });
    return { error: null };
  } catch (e: any) {
    console.error('updateNews 실패:', e);
    return { error: e?.message || '수정 실패' };
  }
};

/** 뉴스 삭제 */
export const deleteNews = async (id: string): Promise<{ error: string | null }> => {
  try {
    await deleteDoc(doc(db, NEWS_COLLECTION, id));
    return { error: null };
  } catch (e: any) {
    console.error('deleteNews 실패:', e);
    return { error: e?.message || '삭제 실패' };
  }
};
