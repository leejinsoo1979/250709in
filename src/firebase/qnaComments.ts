import {
  collection,
  doc,
  addDoc,
  getDocs,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from './config';
import { getCurrentUserAsync } from './auth';
import { isSuperAdmin } from './admins';

/**
 * Q&A 댓글/스레드
 * - qna/{qnaId}/comments 하위 컬렉션에 시간순으로 메시지를 저장
 * - 질문자와 관리자가 서로 이어서 답글을 주고받는 용도
 */
export interface QnAComment {
  id: string;
  body: string;
  images?: string[];
  authorId: string;
  authorName: string;
  isAdmin: boolean; // 관리자(운영자)가 작성한 메시지 여부
  createdAt: Timestamp | null;
}

export interface CreateQnACommentData {
  body: string;
  images?: string[];
}

const QNA_COLLECTION = 'qna';
const COMMENTS_SUBCOLLECTION = 'comments';

const commentsRef = (qnaId: string) =>
  collection(db, QNA_COLLECTION, qnaId, COMMENTS_SUBCOLLECTION);

/** 관리자 표기 이름 (답변 등록과 동일하게 통일) */
const ADMIN_DISPLAY_NAME = 'A.I Q&A 관리자';

/**
 * 댓글 목록 1회 조회 (시간 오름차순)
 */
export const listQnAComments = async (
  qnaId: string
): Promise<{ items: QnAComment[]; error: string | null }> => {
  try {
    const q = query(commentsRef(qnaId), orderBy('createdAt', 'asc'));
    const snap = await getDocs(q);
    const items: QnAComment[] = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<QnAComment, 'id'>),
    }));
    return { items, error: null };
  } catch (e: any) {
    console.error('listQnAComments 실패:', e);
    return { items: [], error: e?.message || '댓글 조회 실패' };
  }
};

/**
 * 댓글 실시간 구독 (시간 오름차순)
 * @returns 구독 해제 함수
 */
export const subscribeQnAComments = (
  qnaId: string,
  onChange: (items: QnAComment[]) => void,
  onError?: (error: string) => void
): (() => void) => {
  const q = query(commentsRef(qnaId), orderBy('createdAt', 'asc'));
  return onSnapshot(
    q,
    (snap) => {
      const items: QnAComment[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<QnAComment, 'id'>),
      }));
      onChange(items);
    },
    (e) => {
      console.error('subscribeQnAComments 실패:', e);
      onError?.(e?.message || '댓글 구독 실패');
    }
  );
};

/**
 * 댓글 작성 (질문자·관리자 누구나, 로그인 필요)
 * - 관리자가 작성하면 작성자명은 'A.I Q&A 관리자'로 고정
 */
export const addQnAComment = async (
  qnaId: string,
  data: CreateQnACommentData
): Promise<{ id: string | null; error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) return { id: null, error: '로그인이 필요합니다.' };

    const body = (data.body || '').trim();
    if (!body) return { id: null, error: '내용을 입력해주세요.' };

    const isAdmin = isSuperAdmin(user.email);
    const authorName = isAdmin
      ? ADMIN_DISPLAY_NAME
      : user.displayName || user.email || '사용자';

    const ref = await addDoc(commentsRef(qnaId), {
      body,
      images: data.images ?? [],
      authorId: user.uid,
      authorName,
      isAdmin,
      createdAt: serverTimestamp(),
    });
    return { id: ref.id, error: null };
  } catch (e: any) {
    console.error('addQnAComment 실패:', e);
    return { id: null, error: e?.message || '댓글 작성 실패' };
  }
};

/**
 * 댓글 삭제 (작성자 본인 또는 관리자)
 */
export const deleteQnAComment = async (
  qnaId: string,
  commentId: string
): Promise<{ error: string | null }> => {
  try {
    await deleteDoc(doc(db, QNA_COLLECTION, qnaId, COMMENTS_SUBCOLLECTION, commentId));
    return { error: null };
  } catch (e: any) {
    console.error('deleteQnAComment 실패:', e);
    return { error: e?.message || '댓글 삭제 실패' };
  }
};
