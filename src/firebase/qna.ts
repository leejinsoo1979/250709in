import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  increment,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './config';
import { getCurrentUserAsync } from './auth';
import { createNotification } from './notifications';

export type QnAStatus = 'pending' | 'answered';

export interface QnAItem {
  id: string;
  title: string;
  body: string;
  images?: string[]; // 질문 첨부 이미지 URL 배열
  answerImages?: string[]; // 답변 첨부 이미지 URL 배열
  authorId: string;
  authorName: string;
  status: QnAStatus;
  isPublic?: boolean; // 공개(true) / 비공개 1:1(false). 미설정(기존 글)은 공개로 간주
  viewCount?: number;
  answer?: string;
  answeredBy?: string;
  answeredByName?: string;
  answeredAt?: Timestamp | null;
  aiStatus?: 'queued' | 'processing' | 'answered' | 'needs_admin' | 'error';
  aiAnswer?: string;
  aiSources?: Array<{ id: string; type: string; title: string; score?: number }>;
  telegramStatus?: 'sent' | 'failed';
  telegramSentAt?: Timestamp | null;
  telegramError?: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface CreateQnAData {
  title: string;
  body: string;
  images?: string[];
  isPublic?: boolean; // 공개 여부 (기본 공개)
}

const QNA_COLLECTION = 'qna';

export const notifyQnACreated = async (qnaId: string): Promise<{ error: string | null }> => {
  try {
    const fn = httpsCallable<{ qnaId: string; origin?: string }, { ok: boolean }>(
      functions,
      'notifyQnACreated'
    );
    const payload: { qnaId: string; origin?: string } = { qnaId };
    if (typeof window !== 'undefined' && window.location.origin) {
      payload.origin = window.location.origin;
    }
    await fn(payload);
    return { error: null };
  } catch (e: any) {
    console.error('notifyQnACreated 실패:', e);
    return { error: e?.message || 'Q&A 알림 전송 실패' };
  }
};

export const requestQnAAiAnswer = async (qnaId: string): Promise<{ error: string | null }> => {
  try {
    const fn = httpsCallable<{ qnaId: string }, { ok: boolean; status: string }>(
      functions,
      'generateQnAAiAnswer'
    );
    await fn({ qnaId });
    return { error: null };
  } catch (e: any) {
    console.error('requestQnAAiAnswer 실패:', e);
    return { error: e?.message || 'AI 답변 요청 실패' };
  }
};

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
      images: data.images ?? [],
      authorId: user.uid,
      authorName: user.displayName || user.email || '사용자',
      status: 'pending' as QnAStatus,
      isPublic: data.isPublic ?? true,
      viewCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    const { error: notifyError } = await notifyQnACreated(ref.id);
    if (notifyError) {
      console.warn('Q&A 텔레그램 알림은 건너뜀:', notifyError);
    }
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

/** 조회수 증가 */
export const incrementQnAView = async (id: string): Promise<{ error: string | null }> => {
  try {
    await updateDoc(doc(db, QNA_COLLECTION, id), {
      viewCount: increment(1),
    });
    return { error: null };
  } catch (e: any) {
    console.error('incrementQnAView 실패:', e);
    return { error: e?.message || '조회수 업데이트 실패' };
  }
};

/** 답변 등록/수정 (관리자만) */
export const answerQnA = async (
  id: string,
  answer: string,
  answerImages: string[] = []
): Promise<{ error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) return { error: '로그인이 필요합니다.' };

    const qnaRef = doc(db, QNA_COLLECTION, id);
    const qnaSnap = await getDoc(qnaRef);
    if (!qnaSnap.exists()) return { error: '질문을 찾을 수 없습니다.' };

    const qna = qnaSnap.data() as Omit<QnAItem, 'id'>;
    const wasAnswered = qna.status === 'answered';

    await updateDoc(qnaRef, {
      answer,
      answerImages,
      status: 'answered' as QnAStatus,
      answeredBy: user.uid,
      answeredByName: 'A.I Q&A 관리자',
      answeredAt: serverTimestamp(),
      aiStatus: null,
      updatedAt: serverTimestamp(),
    });

    if (qna.authorId) {
      try {
        await createNotification(
          qna.authorId,
          'qna_answered',
          wasAnswered ? 'Q&A 답변이 수정되었습니다' : 'Q&A 답변이 등록되었습니다',
          `"${qna.title || '질문'}"에 답변이 ${wasAnswered ? '수정' : '등록'}되었습니다.`,
          { actionUrl: `/qna/${id}` }
        );
      } catch (notificationError) {
        console.warn('Q&A 답변 알림 생성 실패:', notificationError);
      }
    }

    return { error: null };
  } catch (e: any) {
    console.error('answerQnA 실패:', e);
    return { error: e?.message || '답변 등록 실패' };
  }
};
