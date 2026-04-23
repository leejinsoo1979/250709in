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
} from 'firebase/firestore';
import { db } from './config';
import { getCurrentUserAsync } from './auth';

export type QnAStatus = 'pending' | 'answered';

export interface QnAItem {
  id: string;
  title: string;
  body: string;
  authorId: string;
  authorName: string;
  status: QnAStatus;
  answer?: string;
  answeredBy?: string;
  answeredByName?: string;
  answeredAt?: Timestamp | null;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface CreateQnAData {
  title: string;
  body: string;
}

const QNA_COLLECTION = 'qna';

/**
 * 내 질문 목록 조회 (일반 사용자용)
 * - 본인이 작성한 질문만 반환
 */
export const listMyQnA = async (): Promise<{ items: QnAItem[]; error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) return { items: [], error: '로그인이 필요합니다.' };

    const q = query(
      collection(db, QNA_COLLECTION),
      where('authorId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    const items: QnAItem[] = snap.docs.map(d => ({
      id: d.id,
      ...(d.data() as Omit<QnAItem, 'id'>),
    }));
    return { items, error: null };
  } catch (e: any) {
    console.error('listMyQnA 실패:', e);
    return { items: [], error: e?.message || '목록 조회 실패' };
  }
};

/**
 * 전체 Q&A 목록 조회 (관리자용)
 */
export const listAllQnA = async (): Promise<{ items: QnAItem[]; error: string | null }> => {
  try {
    const q = query(collection(db, QNA_COLLECTION), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    const items: QnAItem[] = snap.docs.map(d => ({
      id: d.id,
      ...(d.data() as Omit<QnAItem, 'id'>),
    }));
    return { items, error: null };
  } catch (e: any) {
    console.error('listAllQnA 실패:', e);
    return { items: [], error: e?.message || '목록 조회 실패' };
  }
};

/** 단일 Q&A 조회 */
export const getQnA = async (id: string): Promise<{ item: QnAItem | null; error: string | null }> => {
  try {
    const snap = await getDoc(doc(db, QNA_COLLECTION, id));
    if (!snap.exists()) return { item: null, error: '질문을 찾을 수 없습니다.' };
    return { item: { id: snap.id, ...(snap.data() as Omit<QnAItem, 'id'>) }, error: null };
  } catch (e: any) {
    console.error('getQnA 실패:', e);
    return { item: null, error: e?.message || '조회 실패' };
  }
};

/** 질문 작성 (로그인 사용자 누구나) */
export const createQnA = async (data: CreateQnAData): Promise<{ id: string | null; error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) return { id: null, error: '로그인이 필요합니다.' };

    const now = serverTimestamp() as Timestamp;
    const ref = await addDoc(collection(db, QNA_COLLECTION), {
      title: data.title,
      body: data.body,
      authorId: user.uid,
      authorName: user.displayName || user.email || '사용자',
      status: 'pending' as QnAStatus,
      createdAt: now,
      updatedAt: now,
    });
    return { id: ref.id, error: null };
  } catch (e: any) {
    console.error('createQnA 실패:', e);
    return { id: null, error: e?.message || '작성 실패' };
  }
};

/** 질문 수정 (작성자 본인만) */
export const updateQnA = async (id: string, data: Partial<CreateQnAData>): Promise<{ error: string | null }> => {
  try {
    await updateDoc(doc(db, QNA_COLLECTION, id), {
      ...data,
      updatedAt: serverTimestamp(),
    });
    return { error: null };
  } catch (e: any) {
    console.error('updateQnA 실패:', e);
    return { error: e?.message || '수정 실패' };
  }
};

/** 질문 삭제 (작성자 또는 관리자) */
export const deleteQnA = async (id: string): Promise<{ error: string | null }> => {
  try {
    await deleteDoc(doc(db, QNA_COLLECTION, id));
    return { error: null };
  } catch (e: any) {
    console.error('deleteQnA 실패:', e);
    return { error: e?.message || '삭제 실패' };
  }
};

/** 답변 등록/수정 (관리자만) */
export const answerQnA = async (id: string, answer: string): Promise<{ error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) return { error: '로그인이 필요합니다.' };

    await updateDoc(doc(db, QNA_COLLECTION, id), {
      answer,
      status: 'answered' as QnAStatus,
      answeredBy: user.uid,
      answeredByName: user.displayName || user.email || '관리자',
      answeredAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { error: null };
  } catch (e: any) {
    console.error('answerQnA 실패:', e);
    return { error: e?.message || '답변 등록 실패' };
  }
};
